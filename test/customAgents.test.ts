import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { listProjectAgents, loadProjectAgent } from '../src/customAgents';
import { runAgent } from '../src/agent';
import type { WorkspaceTools } from '../src/workspaceTools';
import type { OllamaClient, OllamaMessage } from '../src/ollamaClient';

async function project(run: (root: string, directory: string) => Promise<void>): Promise<void> {
    const root = await mkdtemp(path.join(tmpdir(), 'copilot-agent-test-'));
    const directory = path.join(root, '.local-copilot', 'agents');
    try { await mkdir(directory, { recursive: true }); await run(root, directory); }
    finally { await rm(root, { recursive: true, force: true }); }
}

describe('project agents', () => {
    it('treats missing agent directories as no profiles', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'copilot-empty-test-'));
        try { assert.deepEqual(await listProjectAgents(root), []); }
        finally { await rm(root, { recursive: true, force: true }); }
    });

    it('loads bounded Markdown profiles and their optional descriptions', async () => project(async (root, dir) => {
        await writeFile(path.join(dir, 'reviewer.agent.md'), '---\nname: Code Reviewer\ndescription: Check for bugs\n---\nReview the code carefully.\n');
        await writeFile(path.join(dir, 'tester.agent.md'), 'Write focused tests.');
        assert.deepEqual(await listProjectAgents(root), [
            { id: 'reviewer', name: 'Code Reviewer', description: 'Check for bugs' },
            { id: 'tester', name: 'tester', description: '' }
        ]);
        assert.equal((await loadProjectAgent(root, 'reviewer')).instructions, 'Review the code carefully.');
    }));

    it('blocks traversal, symlinks, invalid metadata, and oversized instructions', async () => project(async (root, dir) => {
        await assert.rejects(loadProjectAgent(root, '../bad'), /Invalid project agent/);
        await writeFile(path.join(dir, 'broken.agent.md'), '---\nname: reviewer\nunknown: true\n---\nDo things');
        await assert.rejects(listProjectAgents(root), /only name and description/);
        await rm(path.join(dir, 'broken.agent.md'));
        await writeFile(path.join(dir, 'large.agent.md'), 'x'.repeat(20_100));
        await assert.rejects(loadProjectAgent(root, 'large'), /regular Markdown file/);
        await rm(path.join(dir, 'large.agent.md'));
        await writeFile(path.join(root, 'outside.md'), 'external content');
        await symlink(path.join(root, 'outside.md'), path.join(dir, 'linked.agent.md'));
        await assert.rejects(listProjectAgents(root), /Invalid custom agent file/);
    }));

    it('adds project guidance without replacing core approval rules', async () => {
        let instructions = '';
        const client = { complete: async (_model: string, messages: OllamaMessage[]) => {
            instructions = messages[0].content;
            return { role: 'assistant' as const, content: 'done' };
        } } as unknown as Pick<OllamaClient, 'complete'>;
        const result = await runAgent({ client, model: 'local', task: 'review',
            customInstructions: 'Focus on test coverage.', tools: {} as WorkspaceTools });
        assert.equal(result.summary, 'done');
        assert.match(instructions, /All edits and deletions require user review/);
        assert.match(instructions, /Project agent guidance/);
        assert.match(instructions, /Focus on test coverage/);
    });
});
