import { runAgent } from './agent';
import { ChatMessage, OllamaClient } from './ollamaClient';
import { FileChange, WorkspaceTools } from './workspaceTools';

export type DelegationOptions = {
	client: Pick<OllamaClient, 'complete'>;
	chatModel: string;
	codeModel: string;
	task: string;
	/** Full instructions for the code model when they differ from the short task shown in the handoff. */
	codeTask?: string;
	history: ChatMessage[];
	tools: WorkspaceTools;
	maxSteps?: number;
    signal?: AbortSignal;
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

/** Runs a chat -> code -> chat handoff without changing other Ollama clients' model residency. */
export async function delegateCodingTask(options: DelegationOptions): Promise<DelegationResult> {
	options.onProgress?.(`Switching to ${options.codeModel}…`);
	let agent: { summary: string; completed: boolean };
	try {
		agent = await runAgent({
			client: options.client,
			model: options.codeModel,
			task: options.codeTask ?? options.task,
			tools: options.tools,
			maxSteps: options.maxSteps,
            signal: options.signal,
			onProgress: options.onProgress
		});
	} catch (error) {
		// Report the failure to the chat model so the user still hears what happened and any files already changed.
		agent = {
			summary: `The coding model failed: ${error instanceof Error ? error.message : String(error)}`,
			completed: false
		};
	}

	options.signal?.throwIfAborted();
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

	options.onProgress?.(`Switching to ${options.chatModel}…`);
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
