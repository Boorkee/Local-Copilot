import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as os from 'node:os';
import { runCommand } from '../src/commandRunner';

it('returns command output and exit status', async () => {
    const chunks: string[] = [];
    const result = await runCommand('echo local-copilot-test', os.tmpdir(), new AbortController().signal, text => chunks.push(text));
    assert.match(result, /Exit code: 0/);
    assert.match(result, /local-copilot-test/);
    assert.match(chunks.join(''), /local-copilot-test/);
});
it('does not start an already cancelled command', async () => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(() => runCommand('echo no', os.tmpdir(), controller.signal, () => {}), /Task stopped/);
});
