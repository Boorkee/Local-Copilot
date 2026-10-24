import * as readline from 'node:readline/promises';
import { delegateCodingTask } from '../orchestrator';
import { ChatMessage, OllamaClient } from '../ollamaClient';
import { WorkspaceTools } from '../workspaceTools';
import { HANDOFF_USAGE, parseHandoffArgs } from './args';

async function main(): Promise<void> {
	const args = parseHandoffArgs(process.argv.slice(2));
	const client = new OllamaClient(args.url, args.timeoutMs);
	const tools = new WorkspaceTools(args.workspace, { confirmDelete: async () => args.allowDelete });
	const history: ChatMessage[] = [];

	const result = await delegateCodingTask({
		client,
		chatModel: args.chatModel,
		codeModel: args.codeModel,
		task: args.task,
		history,
		tools,
		onProgress: message => console.error(`[handoff] ${message}`)
	});
	history.push(...result.historyAdditions);

	console.log(`\n${result.update}\n`);
	console.log('Files changed:');
	console.log(result.changes.length ? result.changes.map(change => `  ${change.action} ${change.path}`).join('\n') : '  (none)');

	if (!process.stdin.isTTY) {
		return;
	}
	console.log(`\nChatting with ${args.chatModel}. The code model will not be used again. Type "exit" to quit.`);
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		for (;;) {
			const line = (await rl.question('> ')).trim();
			if (line === 'exit' || line === 'quit') {
				break;
			}
			if (!line) {
				continue;
			}
			const answer = await client.chat(args.chatModel, line, history);
			history.push({ role: 'user', content: line }, { role: 'assistant', content: answer });
			console.log(`\n${answer}\n`);
		}
	} finally {
		rl.close();
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : String(error));
	console.error(HANDOFF_USAGE);
	process.exitCode = 1;
});
