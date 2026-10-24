import { OllamaClient, OllamaMessage } from './ollamaClient';
import { WorkspaceTools, workspaceToolDefinitions } from './workspaceTools';

export type AgentOptions = {
	client: Pick<OllamaClient, 'complete'>;
	model: string;
	task: string;
	tools: WorkspaceTools;
	maxSteps?: number;
	onProgress?: (message: string) => void;
};

export type AgentResult = {
	summary: string;
	completed: boolean;
};

const SYSTEM_PROMPT = [
	'You are a coding agent working inside the user\'s workspace.',
	'Use the provided tools to inspect, create, modify, and delete files; all paths are relative to the workspace root.',
	'Read files before changing them, and always write complete file contents.',
	'When the task is finished, reply without calling tools, giving a concise summary of what you changed and why.'
].join(' ');

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
	const maxSteps = options.maxSteps ?? 25;
	const messages: OllamaMessage[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: options.task }
	];

	for (let step = 0; step < maxSteps; step++) {
		const reply = await options.client.complete(options.model, messages, workspaceToolDefinitions);
		messages.push(reply);

		if (!reply.tool_calls?.length) {
			return { summary: reply.content.trim() || 'The coding model finished without a summary.', completed: true };
		}

		for (const call of reply.tool_calls) {
			options.onProgress?.(`Code model: ${call.function.name}`);
			const result = await options.tools.execute(call.function.name, call.function.arguments);
			messages.push({ role: 'tool', content: result, tool_name: call.function.name });
		}
	}

	return {
		summary: `The coding model stopped after ${maxSteps} steps without finishing; the work may be incomplete.`,
		completed: false
	};
}
