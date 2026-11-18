import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { snapshotPath } from '../src/contextSnapshot';

test('collects nested text with relative paths and skips binary and generated files', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-context-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    for (const dir of ['src', 'node_modules']) await fs.mkdir(path.join(root, dir));
    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'hello');
    await fs.writeFile(path.join(root, 'notes'), 'world');
    await fs.writeFile(path.join(root, 'node_modules', 'dep'), 'excluded');
    await fs.writeFile(path.join(root, 'binary'), Buffer.from([1, 0, 2]));
    const snapshot = await snapshotPath(root, 100);
    assert.equal(snapshot.files, 2);
    assert.equal(snapshot.partial, true);
    assert.match(snapshot.content, /src\/main\.ts\nhello/);
    assert.match(snapshot.content, /notes\nworld/);
    assert.doesNotMatch(snapshot.content, /binary|excluded/);
    const excerpt = await snapshotPath(path.join(root, 'notes'), 3);
    assert.equal(excerpt.content, 'wor');
    assert.equal(excerpt.partial, true);
});
