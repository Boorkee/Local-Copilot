import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseWebviewMessage, PROTOCOL_VERSION } from '../src/protocol';

describe('typed webview protocol', () => {
    it('accepts valid intents and strips unrecognized properties', () => {
        assert.equal(PROTOCOL_VERSION, 1);
        assert.deepEqual(parseWebviewMessage({ type: 'sendMessage', model: 'coder', prompt: 'hello', mode: 'agent', privilege: 'admin' }),
            { type: 'sendMessage', model: 'coder', prompt: 'hello', codeModel: undefined, mode: 'agent' });
        assert.deepEqual(parseWebviewMessage({ type: 'stopTask' }), { type: 'stopTask' });
        assert.deepEqual(parseWebviewMessage({ type: 'reviewDecision', id: 'review-1', approved: false }),
            { type: 'reviewDecision', id: 'review-1', approved: false });
        assert.deepEqual(parseWebviewMessage({ type: 'openLocation', path: 'src/app.ts', line: 42 }),
            { type: 'openLocation', path: 'src/app.ts', line: 42 });
        assert.deepEqual(parseWebviewMessage({ type: 'sendMessage', model: 'coder', codeModel: 'coder', prompt: 'plan', mode: 'plan' }),
            { type: 'sendMessage', model: 'coder', codeModel: 'coder', prompt: 'plan', mode: 'plan' });
        assert.deepEqual(parseWebviewMessage({ type: 'attachEditor' }), { type: 'attachEditor' });
        assert.deepEqual(parseWebviewMessage({ type: 'removeAttachment', id: 'attachment-1' }),
            { type: 'removeAttachment', id: 'attachment-1' });
        assert.deepEqual(parseWebviewMessage({ type: 'refreshAgents' }), { type: 'refreshAgents' });
        assert.deepEqual(parseWebviewMessage({ type: 'sendMessage', model: 'auto:fast', codeModel: 'auto:balanced',
            prompt: 'refactor', mode: 'agent', agentId: 'reviewer' }),
            { type: 'sendMessage', model: 'auto:fast', codeModel: 'auto:balanced',
                prompt: 'refactor', mode: 'agent', agentId: 'reviewer' });
    });

    it('rejects invalid messages and forged review actions', () => {
        for (const value of [null, [], 'sendMessage', { type: 'unknown' },
            { type: 'sendMessage', prompt: 'hello', model: 'coder', mode: 'admin' },
            { type: 'sendMessage', prompt: 'a'.repeat(50_001), model: 'coder' },
            { type: 'sendMessage', prompt: 'hello', model: 'coder', agentId: '../outside' },
            { type: 'sendMessage', prompt: 'hello', model: 'coder', agentId: 'x'.repeat(49) },
            { type: 'reviewDecision', id: '', approved: true },
            { type: 'reviewDecision', id: 'review-1', approved: 'yes' },
            { type: 'openDiff', id: 123 },
            { type: 'openLocation', path: 'a.ts', line: -5 },
            { type: 'openExternal', url: 'javascript:alert(1)' },
            { type: 'removeAttachment', id: '' },
            { type: 'applyCode', code: 'a'.repeat(200_001) }]) {
            assert.equal(parseWebviewMessage(value), undefined);
        }
    });
});
