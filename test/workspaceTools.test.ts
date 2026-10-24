import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
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

		assert.doesNotMatch(await tools.execute('list_files', {}), /node_modules/);
	});

	it('reports invalid arguments and unknown tools instead of throwing', async () => {
		const tools = new WorkspaceTools(root);

		assert.match(await tools.execute('read_file', {}), /"path" must be a string/);
		assert.match(await tools.execute('write_file', { path: 'x.txt' }), /"content" must be a string/);
		assert.match(await tools.execute('read_file', { path: 'missing.txt' }), /^Error:/);
		assert.match(await tools.execute('format_disk', {}), /unknown tool/);
		assert.match(await tools.execute('read_file', '{not json'), /^Error:/);
	});
});
