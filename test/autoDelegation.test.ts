import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { ReviewDecision, createChangeReviewer } from '../src/changeReview';
import { DELEGATE_TOOL_NAME, chatWithDelegation } from '../src/orchestrator';
import { OllamaMessage, ToolDefinition } from '../src/ollamaClient';
import { WorkspaceTools } from '../src/workspaceTools';

type Call = { model: string; messages: OllamaMessage[]; tools?: ToolDefinition[] };

function scriptedClient(script: Array<(call: Call) => OllamaMessage | Error>) {
	const calls: Call[] = [];
	return {
		calls,
		client: {
			complete: async (model: string, messages: OllamaMessage[], tools?: ToolDefinition[]) => {
				const call = { model, messages, tools };
				calls.push(call);
				const result = script[calls.length - 1](call);
				if (result instanceof Error) {
					throw result;
				}
				return result;
			}
		}
	};
}

const delegateCall = (args: Record<string, unknown> | string): OllamaMessage => ({
	role: 'assistant',
	content: '',
	tool_calls: [{ function: { name: DELEGATE_TOOL_NAME, arguments: args } }]
});

describe('chatWithDelegation', () => {
	it('answers directly when the chat model does not delegate', async () => {
		const { client, calls } = scriptedClient([() => ({ role: 'assistant', content: 'Hi there.' })]);
		const result = await chatWithDelegation({
			client, chatModel: 'chat', codeModel: 'code', prompt: 'hello', history: [],
			createTools: () => new WorkspaceTools(os.tmpdir())
		});

		assert.equal(result.delegated, false);
		assert.equal(result.content, 'Hi there.');
		assert.equal(calls.length, 1);
		assert.equal(calls[0].tools?.[0].function.name, DELEGATE_TOOL_NAME);
		assert.equal(calls[0].messages[0].role, 'system');
		assert.deepEqual(result.historyAdditions, [
			{ role: 'user', content: 'hello' },
			{ role: 'assistant', content: 'Hi there.' }
		]);
	});

	it('does not offer delegation without a workspace', async () => {
		const { client, calls } = scriptedClient([() => ({ role: 'assistant', content: 'ok' })]);
		await chatWithDelegation({ client, chatModel: 'chat', codeModel: 'code', prompt: 'hello', history: [] });

		assert.equal(calls[0].tools, undefined);
	});

	it('hands the task and context to the code model, then returns to the chat model with its report', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-auto-'));
		try {
			const { client, calls } = scriptedClient([
				() => delegateCall({ task: 'Create util.ts', context: 'Export a function add(a, b).' }),
				() => ({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'write_file', arguments: { path: 'util.ts', content: 'export const add = (a: number, b: number) => a + b;' } } }] }),
				() => ({ role: 'assistant', content: 'Created util.ts.' }),
				() => ({ role: 'assistant', content: 'I added util.ts with add().' })
			]);
			const history = [{ role: 'user' as const, content: 'earlier question' }, { role: 'assistant' as const, content: 'earlier answer' }];
			const progress: string[] = [];

			const result = await chatWithDelegation({
				client, chatModel: 'chat', codeModel: 'code', prompt: 'please add a util', history,
				createTools: () => new WorkspaceTools(root),
				onProgress: message => progress.push(message)
			});

			assert.deepEqual(calls.map(call => call.model), ['chat', 'code', 'code', 'chat']);
			const codeTask = calls[1].messages.find(message => message.role === 'user')!.content;
			assert.match(codeTask, /Create util\.ts/);
			assert.match(codeTask, /Export a function add/);
			assert.match(codeTask, /earlier question/);
			assert.match(codeTask, /please add a util/);

			const finalMessages = calls[3].messages;
			assert.equal(finalMessages[0].role, 'system');
			assert.equal(finalMessages.at(-2)?.content, 'please add a util');
			assert.match(finalMessages.at(-1)!.content, /Created util\.ts\./);
			assert.equal(calls[3].tools, undefined);

			assert.equal(result.delegated, true);
			assert.equal(result.content, 'I added util.ts with add().');
			assert.deepEqual(result.changes, [{ action: 'write', path: 'util.ts' }]);
			assert.equal(result.historyAdditions[0].content, 'please add a util');
			assert.equal(result.historyAdditions.at(-1)?.content, 'I added util.ts with add().');
			assert.ok(await fs.stat(path.join(root, 'util.ts')));
			assert.ok(progress.length > 0);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('tolerates JSON-string or missing tool arguments by falling back to the user prompt', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-auto-'));
		try {
			const { client, calls } = scriptedClient([
				() => delegateCall('not json'),
				() => ({ role: 'assistant', content: 'done' }),
				() => ({ role: 'assistant', content: 'summary' })
			]);
			const result = await chatWithDelegation({
				client, chatModel: 'chat', codeModel: 'code', prompt: 'fix the bug', history: [],
				createTools: () => new WorkspaceTools(root)
			});

			assert.equal(result.delegated, true);
			assert.match(calls[1].messages.find(message => message.role === 'user')!.content, /fix the bug/);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('falls back to plain chat when the chat model does not support tools', async () => {
		const { client, calls } = scriptedClient([
			() => new Error('Ollama request failed (400): registry.ollama.ai/library/gemma:2b does not support tools'),
			() => ({ role: 'assistant', content: 'plain answer' })
		]);
		const result = await chatWithDelegation({
			client, chatModel: 'chat', codeModel: 'code', prompt: 'hello', history: [],
			createTools: () => new WorkspaceTools(os.tmpdir())
		});

		assert.equal(result.content, 'plain answer');
		assert.equal(result.delegated, false);
		assert.equal(calls[1].tools, undefined);
	});

	it('rethrows unrelated errors', async () => {
		const { client } = scriptedClient([() => new Error('boom')]);
		await assert.rejects(chatWithDelegation({
			client, chatModel: 'chat', codeModel: 'code', prompt: 'hello', history: [],
			createTools: () => new WorkspaceTools(os.tmpdir())
		}), /boom/);
	});
});

describe('change review', () => {
	it('reads and updates unsaved editor buffers instead of the file on disk', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-dirty-'));
		try {
			await fs.writeFile(path.join(root, 'a.txt'), 'saved');
			const buffers = new Map<string, string>([[path.join(await fs.realpath(root), 'a.txt'), 'unsaved edit']]);
			const proposals: Array<string | undefined> = [];
			const tools = new WorkspaceTools(root, {
				openDocuments: {
					readUnsaved: file => buffers.get(file),
					writeUnsaved: async (file, content) => {
						if (!buffers.has(file)) {
							return false;
						}
						buffers.set(file, content);
						return true;
					}
				},
				confirmWrite: async proposal => { proposals.push(proposal.before); return true; }
			});

			assert.equal(await tools.execute('read_file', { path: 'a.txt' }), 'unsaved edit');
			await tools.execute('write_file', { path: 'a.txt', content: 'model edit' });
			assert.deepEqual(proposals, ['unsaved edit']);
			assert.equal([...buffers.values()][0], 'model edit');
			assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'saved');

			await tools.execute('write_file', { path: 'b.txt', content: 'new' });
			assert.equal(await fs.readFile(path.join(root, 'b.txt'), 'utf8'), 'new');
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('protects .git regardless of letter case', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-git-'));
		try {
			const tools = new WorkspaceTools(root);
			assert.match(await tools.execute('write_file', { path: '.GIT/config', content: 'x' }), /\.git directory cannot be modified/);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('still hands back to the chat model when the code model fails after changing files', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-fail-'));
		try {
			const { client, calls } = scriptedClient([
				() => delegateCall({ task: 'make files' }),
				() => ({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'write_file', arguments: { path: 'a.txt', content: 'a' } } }] }),
				() => new Error('model crashed'),
				() => ({ role: 'assistant', content: 'It partly failed.' })
			]);
			const result = await chatWithDelegation({
				client, chatModel: 'chat', codeModel: 'code', prompt: 'make files', history: [],
				createTools: () => new WorkspaceTools(root)
			});

			assert.equal(result.content, 'It partly failed.');
			assert.deepEqual(result.changes, [{ action: 'write', path: 'a.txt' }]);
			const finalHandoff = calls[3].messages.at(-1)!.content;
			assert.match(finalHandoff, /model crashed/);
			assert.match(finalHandoff, /wrote a\.txt/);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('does not write a file the user undoes, and writes one they keep', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-review-'));
		try {
			await fs.writeFile(path.join(root, 'a.txt'), 'old');
			const seen: Array<{ path: string; before: string | undefined; after: string }> = [];
			const decisions: ReviewDecision[] = ['undo', 'keep'];
			const reviewer = createChangeReviewer({
				reviewWrite: async proposal => { seen.push(proposal); return decisions.shift()!; },
				confirmDelete: async () => false
			}, true);
			const tools = new WorkspaceTools(root, reviewer);

			assert.match(await tools.execute('write_file', { path: 'a.txt', content: 'new' }), /rejected/);
			assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'old');
			assert.deepEqual(tools.changes, []);

			await tools.execute('write_file', { path: 'b.txt', content: 'created' });
			assert.equal(await fs.readFile(path.join(root, 'b.txt'), 'utf8'), 'created');
			assert.deepEqual(seen, [
				{ path: 'a.txt', before: 'old', after: 'new' },
				{ path: 'b.txt', before: undefined, after: 'created' }
			]);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('Keep All skips later write reviews but deletes are still confirmed', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-review-'));
		try {
			await fs.writeFile(path.join(root, 'gone.txt'), 'x');
			let reviews = 0;
			let deleteAsks = 0;
			const reviewer = createChangeReviewer({
				reviewWrite: async () => { reviews++; return 'keepAll'; },
				confirmDelete: async () => { deleteAsks++; return false; }
			}, true);
			const tools = new WorkspaceTools(root, reviewer);

			await tools.execute('write_file', { path: 'one.txt', content: '1' });
			await tools.execute('write_file', { path: 'two.txt', content: '2' });
			assert.match(await tools.execute('delete_file', { path: 'gone.txt' }), /not approved/);

			assert.equal(reviews, 1);
			assert.equal(deleteAsks, 1);
			assert.equal(tools.changes.length, 2);
			assert.ok(await fs.stat(path.join(root, 'gone.txt')));
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('skips write review when disabled', async () => {
		const reviewer = createChangeReviewer({
			reviewWrite: async () => { throw new Error('should not be asked'); },
			confirmDelete: async () => false
		}, false);

		assert.equal(reviewer.confirmWrite, undefined);
	});
});
