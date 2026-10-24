import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { runAgent } from '../src/agent';
import { delegateCodingTask } from '../src/orchestrator';
import { OllamaClient, OllamaMessage } from '../src/ollamaClient';
import { WorkspaceTools } from '../src/workspaceTools';

function toolCall(name: string, args: Record<string, unknown>): OllamaMessage {
	return { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] };
}

describe('runAgent', () => {
	it('executes tool calls, feeds results back, and returns the final summary', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-agent-'));
		try {
			const replies: OllamaMessage[] = [
				toolCall('write_file', { path: 'a.txt', content: 'hello' }),
				toolCall('read_file', { path: 'a.txt' }),
				{ role: 'assistant', content: 'Created a.txt.' }
			];
			const seen: OllamaMessage[][] = [];
			const client = {
				complete: async (_model: string, messages: OllamaMessage[]) => {
					seen.push(messages.map(message => ({ ...message })));
					return replies.shift()!;
				}
			};

			const result = await runAgent({ client, model: 'code', task: 'make a.txt', tools: new WorkspaceTools(root) });

			assert.deepEqual(result, { summary: 'Created a.txt.', completed: true });
			assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'hello');
			const last = seen[2];
			assert.equal(last[last.length - 1].role, 'tool');
			assert.equal(last[last.length - 1].content, 'hello');
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('stops and reports incomplete work after the step limit', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-agent-'));
		try {
			const client = { complete: async () => toolCall('list_files', {}) };
			const result = await runAgent({ client, model: 'code', task: 'loop', tools: new WorkspaceTools(root), maxSteps: 3 });

			assert.equal(result.completed, false);
			assert.match(result.summary, /after 3 steps/);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});

describe('delegateCodingTask (chat -> code -> chat handoff)', () => {
	it('swaps models with keep_alive: 0, lets the code model edit files, and returns context to the chat model', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-handoff-'));
		try {
			const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
			let loaded = ['chat:7b'];
			let codeStep = 0;
			const fetcher: typeof fetch = async (input, init) => {
				const url = new URL(input.toString());
				const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
				calls.push({ path: url.pathname, body });
				const json = (value: unknown) => new Response(JSON.stringify(value));

				if (url.pathname === '/api/ps') {
					return json({ models: loaded.map(name => ({ name })) });
				}
				if (url.pathname === '/api/generate') {
					loaded = loaded.filter(name => name !== body.model);
					return json({});
				}
				loaded = [String(body.model)];
				if (body.model === 'code:14b') {
					assert.ok(Array.isArray(body.tools), 'code model must receive tool definitions');
					codeStep++;
					return json({
						message: codeStep === 1
							? toolCall('write_file', { path: 'src/hello.ts', content: 'export const hello = "hi";' })
							: { role: 'assistant', content: 'Added src/hello.ts exporting hello.' }
					});
				}
				return json({ message: { role: 'assistant', content: 'The coding model added src/hello.ts.' } });
			};
			const client = new OllamaClient('http://localhost:11434', 1000, fetcher);
			const history = [{ role: 'user' as const, content: 'hi' }, { role: 'assistant' as const, content: 'hello!' }];
			const progress: string[] = [];

			// The chat model is already loaded and has been used.
			await client.chat('chat:7b', 'warm up', []);
			calls.length = 0;

			const result = await delegateCodingTask({
				client,
				chatModel: 'chat:7b',
				codeModel: 'code:14b',
				task: 'add a hello module',
				history,
				tools: new WorkspaceTools(root),
				onProgress: message => progress.push(message)
			});

			assert.equal(await fs.readFile(path.join(root, 'src', 'hello.ts'), 'utf8'), 'export const hello = "hi";');
			assert.deepEqual(calls.map(call => `${call.path}:${String(call.body.model ?? '')}:${call.body.keep_alive ?? ''}`), [
				'/api/ps::',
				'/api/generate:chat:7b:0',
				'/api/chat:code:14b:',
				'/api/chat:code:14b:',
				'/api/ps::',
				'/api/generate:code:14b:0',
				'/api/chat:chat:7b:'
			]);

			const finalChatBody = calls[calls.length - 1].body.messages as OllamaMessage[];
			assert.deepEqual(finalChatBody.slice(0, 2), history);
			const handoff = finalChatBody[finalChatBody.length - 1].content;
			assert.match(handoff, /add a hello module/);
			assert.match(handoff, /Added src\/hello\.ts exporting hello\./);
			assert.match(handoff, /wrote src\/hello\.ts/);

			assert.equal(result.update, 'The coding model added src/hello.ts.');
			assert.deepEqual(result.changes, [{ action: 'write', path: 'src/hello.ts' }]);
			assert.deepEqual(result.historyAdditions, [
				{ role: 'user', content: handoff },
				{ role: 'assistant', content: result.update }
			]);
			assert.ok(progress.length >= 3);

			// Follow-up questions go to the chat model only, with the report in context and no model swap.
			calls.length = 0;
			await client.chat('chat:7b', 'what did it change?', [...history, ...result.historyAdditions]);
			assert.deepEqual(calls.map(call => call.path), ['/api/chat']);
			assert.equal(calls[0].body.model, 'chat:7b');
			assert.match(JSON.stringify(calls[0].body.messages), /Added src\/hello\.ts/);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
