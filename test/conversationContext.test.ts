import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recentContext } from '../src/conversationContext';

describe('recentContext', () => {
    it('keeps recent messages in chronological order and caps the count', () => {
        const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, content: String(i) }));
        assert.deepEqual(recentContext(history).map(message => message.content), Array.from({ length: 20 }, (_, i) => String(i + 10)));
        assert.equal(history.length, 30);
    });

    it('avoids oversized history while preserving the newest message', () => {
        const history = [{ role: 'user' as const, content: 'old' },
            { role: 'assistant' as const, content: 'x'.repeat(80) },
            { role: 'user' as const, content: 'recent' }];
        assert.deepEqual(recentContext(history, 10, 20).map(message => message.content), ['recent']);
        const truncated = recentContext(history, 10, 40);
        assert.equal(truncated.length, 1);
        assert.equal(truncated[0].content, 'recent');
        const huge = recentContext([{ role: 'user', content: 'z'.repeat(500) }], 10, 60);
        assert.equal(huge[0].content.length, 60);
        assert.match(huge[0].content, /^\[Older content omitted\]/);
        assert.match(huge[0].content, /z{20}$/);
    });
});
