import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { WorkspaceTools } from '../src/workspaceTools';

let root: string;
let outside: string;

before(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-ws-'));
	outside = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-out-'));
	await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
});

after(async () => {
	await fs.rm(root, { recursive: true, force: true });
	await fs.rm(outside, { recursive: true, force: true });
});

describe('WorkspaceTools', () => {
	it('writes (creating folders), reads, and lists files', async () => {
		const tools = new WorkspaceTools(root);

		assert.match(await tools.execute('write_file', { path: 'src/a/b.ts', content: 'export const x = 1;' }), /Wrote/);
		assert.equal(await tools.execute('read_file', { path: 'src/a/b.ts' }), 'export const x = 1;');
		assert.equal(await tools.execute('list_files', {}), 'src/a/b.ts');
		assert.deepEqual(tools.changes, [{ action: 'write', path: 'src/a/b.ts' }]);
	});

	it('overwrites existing file contents', async () => {
		const tools = new WorkspaceTools(root);
		await tools.execute('write_file', { path: 'o.txt', content: 'old' });
		await tools.execute('write_file', { path: 'o.txt', content: 'new' });

		assert.equal(await fs.readFile(path.join(root, 'o.txt'), 'utf8'), 'new');
	});

	it('accepts JSON-string arguments as some models send them', async () => {
		const tools = new WorkspaceTools(root);
		await tools.execute('write_file', JSON.stringify({ path: 'json.txt', content: 'hi' }));

		assert.equal(await tools.execute('read_file', JSON.stringify({ path: 'json.txt' })), 'hi');
	});

	it('deletes a file only after approval', async () => {
		await fs.writeFile(path.join(root, 'd.txt'), 'x');
		const asked: string[] = [];
		const denied = new WorkspaceTools(root, { confirmDelete: async file => { asked.push(file); return false; } });
		assert.match(await denied.execute('delete_file', { path: 'd.txt' }), /not approved/);
		assert.equal(await fs.readFile(path.join(root, 'd.txt'), 'utf8'), 'x');

		const approved = new WorkspaceTools(root, { confirmDelete: async () => true });
		assert.match(await approved.execute('delete_file', { path: 'd.txt' }), /Deleted d\.txt/);
		await assert.rejects(fs.stat(path.join(root, 'd.txt')));
		assert.deepEqual(approved.changes, [{ action: 'delete', path: 'd.txt' }]);
		assert.deepEqual(asked, ['d.txt']);
	});

	it('refuses deletion when no approval handler is configured', async () => {
		await fs.writeFile(path.join(root, 'keep.txt'), 'x');
		const tools = new WorkspaceTools(root);

		assert.match(await tools.execute('delete_file', { path: 'keep.txt' }), /not approved/);
		assert.equal(await fs.readFile(path.join(root, 'keep.txt'), 'utf8'), 'x');
	});

	it('refuses to delete directories', async () => {
		await fs.mkdir(path.join(root, 'dir'), { recursive: true });
		const tools = new WorkspaceTools(root, { confirmDelete: async () => true });

		assert.match(await tools.execute('delete_file', { path: 'dir' }), /not a file/);
		assert.ok((await fs.stat(path.join(root, 'dir'))).isDirectory());
	});

	it('rejects paths that escape the workspace', async () => {
		const tools = new WorkspaceTools(root, { confirmDelete: async () => true });
		const target = path.join(outside, 'secret.txt');

		for (const escape of ['../secret.txt', target, '..']) {
			assert.match(await tools.execute('read_file', { path: escape }), /outside the workspace/);
			assert.match(await tools.execute('write_file', { path: escape, content: 'x' }), /Error/);
			assert.match(await tools.execute('delete_file', { path: escape }), /Error/);
		}
		assert.equal(await fs.readFile(target, 'utf8'), 'secret');
	});

	it('rejects symlinks that resolve outside the workspace', async t => {
		const link = path.join(root, 'link');
		try {
			await fs.symlink(outside, link, 'junction');
		} catch {
			t.skip('symlinks are unavailable on this system');
			return;
		}
		const tools = new WorkspaceTools(root);

		assert.match(await tools.execute('read_file', { path: 'link/secret.txt' }), /outside the workspace/);
		assert.match(await tools.execute('write_file', { path: 'link/new.txt', content: 'x' }), /outside the workspace/);
		await assert.rejects(fs.stat(path.join(outside, 'new.txt')));
	});

	it('protects .git and the workspace root from modification', async () => {
		const tools = new WorkspaceTools(root, { confirmDelete: async () => true });

		assert.match(await tools.execute('write_file', { path: '.git/config', content: 'x' }), /\.git/);
		assert.match(await tools.execute('write_file', { path: '.', content: 'x' }), /root/);
	});

	it('skips node_modules when listing', async () => {
		const tools = new WorkspaceTools(root);
		await tools.execute('write_file', { path: 'node_modules/pkg/index.js', content: 'x' });
		await tools.execute('write_file', { path: 'graphify-out/GRAPH_REPORT.md', content: 'graph needle' });

		assert.doesNotMatch(await tools.execute('list_files', {}), /node_modules/);
		assert.doesNotMatch(await tools.execute('list_files', {}), /graphify-out/);
		assert.equal(await tools.execute('read_file', { path: 'graphify-out/GRAPH_REPORT.md' }), 'graph needle');
		const search = JSON.parse(await tools.execute('search_workspace', { query: 'graph needle' }));
		assert.equal(search.matches.length, 0);
	});

	it('reports invalid arguments and unknown tools instead of throwing', async () => {
		const tools = new WorkspaceTools(root);

		assert.match(await tools.execute('read_file', {}), /"path" must be a string/);
		assert.match(await tools.execute('write_file', { path: 'x.txt' }), /"content" must be a string/);
		assert.match(await tools.execute('read_file', { path: 'missing.txt' }), /^Error:/);
		assert.match(await tools.execute('format_disk', {}), /unknown tool/);
		assert.match(await tools.execute('read_file', '{not json'), /^Error:/);
	});

    it('searches bounded workspace text with line numbers and ignores dependencies', async () => {
        await fs.writeFile(path.join(root, 'search.txt'), 'first line\nunique needle here\nneedle again\n');
        const tools = new WorkspaceTools(root);
        const result = JSON.parse(await tools.execute('search_workspace', { query: 'NEEDLE', maxResults: 1 }));
        assert.deepEqual(result.matches, [{ path: 'search.txt', line: 2, excerpt: 'unique needle here' }]);
        assert.equal(result.truncated, true);
        assert.match(await tools.execute('search_workspace', { query: '' }), /Search text/);
        assert.match(await tools.execute('search_workspace', { query: 'x', maxResults: 500 }), /maxResults/);
        assert.match(await tools.execute('search_workspace', { query: 'secret', path: '../' }), /outside the workspace/);
    });

    it('reads precise file ranges with input and output limits', async () => {
        await fs.writeFile(path.join(root, 'range.txt'), 'first\r\nsecond\r\nthird');
        const tools = new WorkspaceTools(root);
        const range = JSON.parse(await tools.execute('read_file_range', { path: 'range.txt', startLine: 2, endLine: 3 }));
        assert.equal(range.text, '2: second\n3: third');
        assert.equal(range.totalLines, 3);
        assert.match(await tools.execute('read_file_range', { path: 'range.txt', startLine: 0, endLine: 2 }), /Line range/);
        assert.match(await tools.execute('read_file_range', { path: 'range.txt', startLine: 2, endLine: 300 }), /Line range/);
    });

    it('does not pull oversized unsaved buffers into model context', async () => {
        await fs.writeFile(path.join(root, 'small-on-disk.txt'), 'short');
        const tools = new WorkspaceTools(root, { openDocuments: {
            readUnsaved: () => 'x'.repeat(220_000), writeUnsaved: async () => false
        } });
        assert.match(await tools.execute('read_file', { path: 'small-on-disk.txt' }), /too large/);
        const result = JSON.parse(await tools.execute('search_workspace', { query: 'xxxx', path: '.' }));
        assert.equal(result.matches.some((item: { path: string }) => item.path === 'small-on-disk.txt'), false);
    });

    it('replaces a unique span with review and rejects changed files', async () => {
        await fs.writeFile(path.join(root, 'patch.txt'), 'alpha beta gamma');
        const approved = new WorkspaceTools(root, { confirmWrite: async proposal => {
            assert.equal(proposal.before, 'alpha beta gamma');
            assert.equal(proposal.after, 'alpha BETA gamma');
            return true;
        } });
        assert.match(await approved.execute('replace_in_file', { path: 'patch.txt', oldText: 'beta', newText: 'BETA' }), /Wrote/);
        assert.equal(await fs.readFile(path.join(root, 'patch.txt'), 'utf8'), 'alpha BETA gamma');
        await fs.writeFile(path.join(root, 'patch.txt'), 'twice twice');
        assert.match(await approved.execute('replace_in_file', { path: 'patch.txt', oldText: 'twice', newText: 'once' }), /ambiguous/);

        await fs.writeFile(path.join(root, 'patch.txt'), 'initial');
        const stale = new WorkspaceTools(root, { confirmWrite: async () => {
            await fs.writeFile(path.join(root, 'patch.txt'), 'changed during review');
            return true;
        } });
        assert.match(await stale.execute('replace_in_file', { path: 'patch.txt', oldText: 'initial', newText: 'updated' }), /changed while you reviewed/);
        assert.equal(await fs.readFile(path.join(root, 'patch.txt'), 'utf8'), 'changed during review');
    });

    it('reads staged and unstaged git diffs without executing a shell', async () => {
        const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-git-'));
        try {
            execFileSync('git', ['init', '-q', repo]);
            await fs.writeFile(path.join(repo, 'file.txt'), 'test content\n');
            execFileSync('git', ['add', 'file.txt'], { cwd: repo });
            const tools = new WorkspaceTools(repo);
            const diff = JSON.parse(await tools.execute('get_git_diff', {}));
            assert.match(diff.staged, /test content/);
            assert.equal(diff.unstaged, '');
        } finally {
            await fs.rm(repo, { recursive: true, force: true });
        }
    });
});
