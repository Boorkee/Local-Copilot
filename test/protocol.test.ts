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
    });

    it('rejects invalid messages and forged review actions', () => {
        for (const value of [null, [], 'sendMessage', { type: 'unknown' },
            { type: 'sendMessage', prompt: 'hello', model: 'coder', mode: 'admin' },
            { type: 'sendMessage', prompt: 'a'.repeat(50_001), model: 'coder' },
            { type: 'reviewDecision', id: '', approved: true },
            { type: 'reviewDecision', id: 'review-1', approved: 'yes' },
            { type: 'openDiff', id: 123 },
            { type: 'applyCode', code: 'a'.repeat(200_001) }]) {
            assert.equal(parseWebviewMessage(value), undefined);
        }
    });
});
