import { runAgent } from './agent';
import { ChatMessage, OllamaClient, OllamaMessage, ToolDefinition } from './ollamaClient';
import { FileChange, WorkspaceTools } from './workspaceTools';

export const DELEGATE_TOOL_NAME = 'delegate_coding_task';

export const delegateToolDefinition: ToolDefinition = {
	type: 'function',
	function: {
		name: DELEGATE_TOOL_NAME,
		description: 'Hand a task to a larger coding model that can read, write, and delete files in the user\'s workspace. Use it when the user asks to create, change, fix, refactor, or review code or files in the project, or for any programming task too large or complex to answer well in chat.',
		parameters: {
			type: 'object',
			properties: {
				task: { type: 'string', description: 'A complete, self-contained description of the work to do.' },
				context: { type: 'string', description: 'Everything the coding model needs to know from this conversation: requirements, file names, constraints, earlier decisions.' }
			},
			required: ['task']
		}
	}
};

export const CHAT_SYSTEM_PROMPT = [
	'You are the chat assistant of Local Copilot, running on a small local model.',
	'You cannot create, edit, or delete files yourself. Answer questions, explain code, and discuss ideas yourself.',
	`If the user asks for any file or code in their project to be created, changed, fixed, refactored, or deleted, or the work is too complex for you, you MUST call the ${DELEGATE_TOOL_NAME} tool with a complete task and all needed context. Do not answer such requests in text.`,
	'After the coding model reports back, summarize what it did and answer follow-up questions yourself.'
].join(' ');

const TRANSCRIPT_MESSAGES = 6;
const TRANSCRIPT_CHARS = 1500;

export type DelegationOptions = {
	client: Pick<OllamaClient, 'complete'>;
	chatModel: string;
	codeModel: string;
	task: string;
	/** Full instructions for the code model when they differ from the short task shown in the handoff. */
	codeTask?: string;
	history: ChatMessage[];
	tools: WorkspaceTools;
	systemPrompt?: string;
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
	let agent: { summary: string; completed: boolean };
	try {
		agent = await runAgent({
			client: options.client,
			model: options.codeModel,
			task: options.codeTask ?? options.task,
			tools: options.tools,
			maxSteps: options.maxSteps,
			onProgress: options.onProgress
		});
	} catch (error) {
		// Report the failure to the chat model so the user still hears what happened and any files already changed.
		agent = {
			summary: `The coding model failed: ${error instanceof Error ? error.message : String(error)}`,
			completed: false
		};
	}

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
		...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt } as OllamaMessage] : []),
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

export type AutoChatOptions = {
	client: Pick<OllamaClient, 'complete'>;
	chatModel: string;
	codeModel: string;
	prompt: string;
	history: ChatMessage[];
	/** Returns workspace tools, or undefined when no workspace is open (delegation is then not offered). */
	createTools?: () => WorkspaceTools | undefined;
	onProgress?: (message: string) => void;
};

export type AutoChatResult = {
	content: string;
	delegated: boolean;
	changes: FileChange[];
	historyAdditions: ChatMessage[];
};

function parseToolArguments(raw: Record<string, unknown> | string): Record<string, unknown> {
	if (typeof raw !== 'string') {
		return raw ?? {};
	}
	try {
		const parsed: unknown = JSON.parse(raw || '{}');
		return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
	} catch {
		return {};
	}
}

function buildCodeTask(task: string, context: string, history: ChatMessage[], prompt: string): string {
	const transcript = [...history, { role: 'user', content: prompt }]
		.slice(-TRANSCRIPT_MESSAGES)
		.map(message => `${message.role}: ${message.content.slice(0, TRANSCRIPT_CHARS)}`)
		.join('\n\n');
	return [
		task,
		context ? `\nContext from the chat model:\n${context}` : '',
		`\nRecent conversation with the user:\n${transcript}`
	].join('\n');
}

/**
 * Normal chat turn. The chat model may decide on its own to call delegate_coding_task;
 * the code model then does the work and the chat model resumes with its report.
 */
export async function chatWithDelegation(options: AutoChatOptions): Promise<AutoChatResult> {
	const tools = options.createTools?.();
	const messages: OllamaMessage[] = [
		{ role: 'system', content: CHAT_SYSTEM_PROMPT },
		...options.history,
		{ role: 'user', content: options.prompt }
	];

	let reply: OllamaMessage;
	try {
		reply = await options.client.complete(options.chatModel, messages, tools ? [delegateToolDefinition] : undefined);
	} catch (error) {
		// Chat models without tool support still work as plain chat.
		if (!tools || !/does not support tools/i.test(error instanceof Error ? error.message : String(error))) {
			throw error;
		}
		reply = await options.client.complete(options.chatModel, messages);
	}

	const call = reply.tool_calls?.find(candidate => candidate.function.name === DELEGATE_TOOL_NAME);
	if (!tools || !call) {
		const content = reply.content || 'I have nothing to add.';
		return {
			content,
			delegated: false,
			changes: [],
			historyAdditions: [
				{ role: 'user', content: options.prompt },
				{ role: 'assistant', content }
			]
		};
	}

	const args = parseToolArguments(call.function.arguments);
	const task = typeof args.task === 'string' && args.task.trim() ? args.task.trim() : options.prompt;
	const context = typeof args.context === 'string' ? args.context.trim() : '';
	options.onProgress?.('The chat model is handing this task to the code model…');
	const result = await delegateCodingTask({
		client: options.client,
		chatModel: options.chatModel,
		codeModel: options.codeModel,
		task,
		codeTask: buildCodeTask(task, context, options.history, options.prompt),
		history: [...options.history, { role: 'user', content: options.prompt }],
		systemPrompt: CHAT_SYSTEM_PROMPT,
		tools,
		onProgress: options.onProgress
	});

	return {
		content: result.update,
		delegated: true,
		changes: result.changes,
		historyAdditions: [{ role: 'user', content: options.prompt }, ...result.historyAdditions]
	};
}
