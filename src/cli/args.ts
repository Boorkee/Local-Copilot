export type HandoffArgs = {
	task: string;
	workspace: string;
	chatModel: string;
	codeModel: string;
	url: string;
	timeoutMs: number;
	allowDelete: boolean;
};

export const HANDOFF_USAGE = 'Usage: node out/cli/handoff.js [--workspace <dir>] [--chat-model <name>] [--code-model <name>] '
	+ '[--url <ollama url>] [--timeout-ms <ms>] [--allow-delete] "<task for the code model>"';

export function parseHandoffArgs(argv: string[]): HandoffArgs {
	const result: HandoffArgs = {
		task: '',
		workspace: process.cwd(),
		chatModel: 'qwen2.5-coder:7b',
		codeModel: 'qwen2.5-coder:14b',
		url: 'http://127.0.0.1:11434',
		timeoutMs: 600000,
		allowDelete: false
	};
	const positional: string[] = [];

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		const value = (): string => {
			const next = argv[++index];
			if (next === undefined) {
				throw new Error(`${arg} requires a value.`);
			}
			return next;
		};
		switch (arg) {
			case '--workspace': result.workspace = value(); break;
			case '--chat-model': result.chatModel = value(); break;
			case '--code-model': result.codeModel = value(); break;
			case '--url': result.url = value(); break;
			case '--timeout-ms': {
				const timeout = Number(value());
				if (!Number.isFinite(timeout) || timeout < 1000) {
					throw new Error('--timeout-ms must be a number of at least 1000.');
				}
				result.timeoutMs = timeout;
				break;
			}
			case '--allow-delete': result.allowDelete = true; break;
			default:
				if (arg.startsWith('--')) {
					throw new Error(`Unknown option ${arg}.`);
				}
				positional.push(arg);
		}
	}

	result.task = positional.join(' ').trim();
	if (!result.task) {
		throw new Error('A task description is required.');
	}
	return result;
}
