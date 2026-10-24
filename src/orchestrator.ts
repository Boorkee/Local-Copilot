import { runAgent } from './agent';
import { ChatMessage, OllamaClient } from './ollamaClient';
import { FileChange, WorkspaceTools } from './workspaceTools';

export type DelegationOptions = {
	client: Pick<OllamaClient, 'complete'>;
	chatModel: string;
	codeModel: string;
	task: string;
	history: ChatMessage[];
	tools: WorkspaceTools;
	maxSteps?: number;
	onProgress?: (message: string) => void;
};

export type DelegationResult = {
	update: string;
	codeSummary: string;
	completed: boolean;
	changes: FileChange[];
	historyAdditions: ChatMessage[];
};

function describeChanges(changes: FileChange[]): string {
	return changes.length
		? changes.map(change => `- ${change.action === 'write' ? 'wrote' : 'deleted'} ${change.path}`).join('\n')
		: '- no files were changed';
}

/**
 * Runs the chat -> code -> chat handoff. OllamaClient unloads the previously loaded
 * model (keep_alive: 0) whenever a different model is requested, so only one model
 * occupies VRAM at a time.
 */
export async function delegateCodingTask(options: DelegationOptions): Promise<DelegationResult> {
	options.onProgress?.(`Unloading chat model and loading ${options.codeModel}…`);
	const agent = await runAgent({
		client: options.client,
		model: options.codeModel,
		task: options.task,
		tools: options.tools,
		maxSteps: options.maxSteps,
		onProgress: options.onProgress
	});

	const changes = [...options.tools.changes];
	const handoff = [
		`I delegated this task to the coding model (${options.codeModel}): ${options.task}`,
		'',
		`Coding model report${agent.completed ? '' : ' (incomplete)'}:`,
		agent.summary,
		'',
		'Files changed:',
		describeChanges(changes),
		'',
		'Briefly tell me what was done. Answer my follow-up questions yourself using this report; do not ask for the coding model again.'
	].join('\n');

	options.onProgress?.(`Unloading ${options.codeModel} and reloading ${options.chatModel}…`);
	const reply = await options.client.complete(options.chatModel, [
		...options.history,
		{ role: 'user', content: handoff }
	]);

	return {
		update: reply.content,
		codeSummary: agent.summary,
		completed: agent.completed,
		changes,
		historyAdditions: [
			{ role: 'user', content: handoff },
			{ role: 'assistant', content: reply.content }
		]
	};
}
