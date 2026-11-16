import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileReview, ReviewQueue } from '../src/reviewQueue';
import { READ_ONLY_TOOLS, WorkspaceTools } from '../src/workspaceTools';
import { runAgent } from '../src/agent';

describe('inline reviews', () => {
    it('counts added and removed lines and preserves literal code', () => {
        const review = fileReview('write', 'index.ts', 'same\nold\n', 'same\n<img>\nnew\n');
        assert.equal(review.added, 2);
        assert.equal(review.removed, 1);
        assert.ok(review.lines?.some(line => line.kind === 'add' && line.text === '<img>'));
    });
    it('caps large inline previews without losing change counts', () => {
        const before = Array.from({ length: 400 }, (_, i) => `before ${i}`).join('\n') + '\n';
        const after = Array.from({ length: 400 }, (_, i) => `after ${i}`).join('\n') + '\n';
        const review = fileReview('write', 'large.ts', before, after);
        assert.equal(review.added, 400);
        assert.equal(review.removed, 400);
        assert.ok((review.lines?.length ?? 0) <= 121);
        assert.ok(review.lines?.some(line => line.kind === 'remove'));
        assert.ok(review.lines?.some(line => line.kind === 'add'));
        assert.ok(review.lines?.some(line => /Open full diff/.test(line.text)));
    });
    it('rejects stale decisions and cancels pending approvals', async () => {
        const queue = new ReviewQueue(() => {});
        const first = queue.request({ kind: 'command', title: 'npm test' });
        const oldId = queue.current!.id;
        queue.cancel();
        assert.equal(await first, false);
        const next = queue.request({ kind: 'command', title: 'npm install' });
        queue.decide(oldId, true);
        assert.ok(queue.current);
        queue.decide(queue.current!.id, false);
        assert.equal(await next, false);
    });
    it('waits for Keep and detects edits made during review', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-review-'));
        try {
            const file = path.join(root, 'example.ts');
            await fs.writeFile(file, 'original\n');
            let queue!: ReviewQueue;
            let shown!: () => void;
            let ready = new Promise<void>(resolve => { shown = resolve; });
            queue = new ReviewQueue(card => { if (card) shown(); });
            const tools = new WorkspaceTools(root, { confirmWrite: p => queue.request(fileReview('write', p.path, p.before ?? '', p.after)) });
            const rejected = tools.execute('write_file', { path: 'example.ts', content: 'change\n' });
            await ready;
            assert.equal(await fs.readFile(file, 'utf8'), 'original\n');
            queue.decide(queue.current!.id, false);
            assert.match(await rejected, /rejected/);
            ready = new Promise<void>(resolve => { shown = resolve; });
            const stale = tools.execute('write_file', { path: 'example.ts', content: 'agent\n' });
            await ready;
            await fs.writeFile(file, 'user edit\n');
            queue.decide(queue.current!.id, true);
            assert.match(await stale, /changed while/);
            assert.equal(await fs.readFile(file, 'utf8'), 'user edit\n');
            assert.equal(tools.changes.length, 0);
        } finally { await fs.rm(root, { recursive: true, force: true }); }
    });
    it('routes commands and IDE tools without /code and passes results back to the model', async () => {
        let step = 0;
        let command = '';
        const tools = new WorkspaceTools(os.tmpdir(), {
            runCommand: async value => { command = value; return 'Exit code: 0\n2 tests passed'; },
            editorAction: async () => 'No diagnostics'
        });
        const result = await runAgent({ model: 'code', task: 'run the tests', tools, history: [{role:'user', content:'use npm'}],
            client: { complete: async (_model, messages, definitions) => {
                assert.ok(definitions?.some(d => d.function.name === 'run_command'));
                if (step++ === 0) {
                    assert.ok(messages.some(m => m.content === 'use npm'));
                    return { role: 'assistant', content: '', tool_calls: [{ function: { name: 'run_command', arguments: { command: 'npm test' } } }] };
                }
                assert.match(messages.at(-1)!.content, /2 tests passed/);
                return { role: 'assistant', content: 'Tests passed.' };
            } }
        });
        assert.equal(command, 'npm test');
        assert.equal(result.summary, 'Tests passed.');
    });
    it('blocks tools after cancellation and outside-workspace command directories', async () => {
        const controller = new AbortController();
        controller.abort(new Error('Task stopped.'));
        let executed = false;
        const tools = new WorkspaceTools(os.tmpdir(), { assertActive: () => controller.signal.throwIfAborted(), runCommand: async () => { executed = true; return 'ok'; } });
        assert.match(await tools.execute('run_command', { command:'echo bad' }), /Task stopped/);
        assert.equal(executed, false);
        const confined = new WorkspaceTools(os.tmpdir(), { runCommand: async () => { executed = true; return 'ok'; } });
        assert.match(await confined.execute('run_command', {command:'echo bad', cwd:'..'}), /outside the workspace/);
        assert.equal(executed, false);
    });
    it('enforces read-only Plan mode even if the model invents a write tool', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-plan-'));
        try {
            let attemptedCommand = false;
            const tools = new WorkspaceTools(root, { allowedTools: READ_ONLY_TOOLS,
                runCommand: async () => { attemptedCommand = true; return 'unexpected'; } });
            let count = 0;
            const result = await runAgent({ model: 'code', task: 'plan a module', tools, mode: 'plan',
                client: { complete: async (_model, messages, definitions) => {
                    assert.equal(definitions?.some(definition => definition.function.name === 'write_file'), false);
                    assert.equal(definitions?.some(definition => definition.function.name === 'run_command'), false);
                    assert.equal(definitions?.some(definition => definition.function.name === 'search_workspace'), true);
                    if (count++ === 0) return { role: 'assistant', content: '', tool_calls: [
                        { function: { name: 'write_file', arguments: { path: 'bad.txt', content: 'bad' } } },
                        { function: { name: 'run_command', arguments: { command: 'touch bad.txt' } } }
                    ] };
                    assert.match(messages.at(-1)!.content, /not permitted in read-only Plan mode/);
                    return { role: 'assistant', content: 'Here is a read-only plan.' };
                } }
            });
            assert.equal(result.completed, true);
            assert.equal(attemptedCommand, false);
            await assert.rejects(fs.stat(path.join(root, 'bad.txt')));
        } finally { await fs.rm(root, { recursive: true, force: true }); }
    });
});
