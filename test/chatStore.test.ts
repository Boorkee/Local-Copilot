import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Chat, ChatStore, MAX_CHATS, Storage } from '../src/chatStore';

function memoryStorage(initial: Record<string, unknown> = {}): Storage & { data: Record<string, unknown> } {
	const data = { ...initial };
	return {
		data,
		get: <T>(key: string) => data[key] as T | undefined,
		update: async (key, value) => { data[key] = JSON.parse(JSON.stringify(value ?? null)); }
	};
}

function clock() {
	let time = 1000;
	return () => (time += 10);
}

describe('ChatStore', () => {
	it('starts with one empty active chat and reuses it instead of piling up empty chats', () => {
		const store = new ChatStore(memoryStorage(), clock());
		const first = store.active();

		assert.equal(first.transcript.length, 0);
		assert.equal(store.create().id, first.id);
		assert.equal(store.list().length, 1);
	});

	it('records turns, titles the chat from the first prompt, and keeps hidden history separate', () => {
		const store = new ChatStore(memoryStorage(), clock());
		const chat = store.active();

		store.appendTurn(
			chat.id,
			[{ role: 'user', content: 'Add   a login\npage please' }, { role: 'assistant', content: 'Done', changes: [{ action: 'write', path: 'login.ts' }] }],
			[{ role: 'user', content: 'hidden handoff' }, { role: 'assistant', content: 'Done' }]
		);

		const saved = store.get(chat.id)!;
		assert.equal(saved.title, 'Add a login page please');
		assert.equal(saved.transcript.length, 2);
		assert.equal(saved.history[0].content, 'hidden handoff');
		assert.deepEqual(saved.transcript[1].changes, [{ action: 'write', path: 'login.ts' }]);
	});

	it('truncates long titles', () => {
		const store = new ChatStore(memoryStorage(), clock());
		const chat = store.active();
		store.appendTurn(chat.id, [{ role: 'user', content: 'x'.repeat(200) }], []);

		assert.equal(store.get(chat.id)!.title.length, 48);
		assert.ok(store.get(chat.id)!.title.endsWith('…'));
	});

	it('supports several chats, switching between them, and lists the most recent first', () => {
		const store = new ChatStore(memoryStorage(), clock());
		const a = store.active();
		store.appendTurn(a.id, [{ role: 'user', content: 'first task' }], []);
		const b = store.create();
		store.appendTurn(b.id, [{ role: 'user', content: 'second task' }], []);

		assert.notEqual(a.id, b.id);
		assert.deepEqual(store.list().map(chat => chat.title), ['second task', 'first task']);
		assert.equal(store.active().id, b.id);
		assert.equal(store.select(a.id)?.id, a.id);
		assert.equal(store.active().id, a.id);
		assert.equal(store.select('missing'), undefined);
		assert.equal(store.active().id, a.id);
	});

	it('persists chats and the active chat across restarts', () => {
		const storage = memoryStorage();
		const first = new ChatStore(storage, clock());
		const a = first.active();
		first.appendTurn(a.id, [{ role: 'user', content: 'keep me' }, { role: 'assistant', content: 'ok' }], [{ role: 'user', content: 'keep me' }]);
		const b = first.create();
		first.appendTurn(b.id, [{ role: 'user', content: 'other' }], []);
		first.select(a.id);

		const reopened = new ChatStore(storage, clock());
		assert.equal(reopened.active().id, a.id);
		assert.equal(reopened.active().transcript[0].content, 'keep me');
		assert.equal(reopened.list().length, 2);
	});

	it('deleting the open chat opens the most recent remaining one, or a fresh chat when none are left', () => {
		const store = new ChatStore(memoryStorage(), clock());
		const a = store.active();
		store.appendTurn(a.id, [{ role: 'user', content: 'a' }], []);
		const b = store.create();
		store.appendTurn(b.id, [{ role: 'user', content: 'b' }], []);

		assert.equal(store.delete(b.id).id, a.id);
		const fresh = store.delete(a.id);
		assert.equal(fresh.transcript.length, 0);
		assert.equal(store.list().length, 1);
	});

	it('ignores turns for chats that were deleted while a request was running', () => {
		const store = new ChatStore(memoryStorage(), clock());
		const chat = store.active();
		store.delete(chat.id);

		assert.equal(store.appendTurn(chat.id, [{ role: 'user', content: 'late' }], []), false);
		assert.equal(store.list().every(summary => summary.title !== 'late'), true);
	});

	it('drops corrupt saved entries and caps the number of stored chats', () => {
		const valid: Chat = { id: 'ok', title: 'ok', createdAt: 1, updatedAt: 1, history: [], transcript: [] };
		const store = new ChatStore(memoryStorage({ 'localCopilot.chats': [valid, { id: 5 }, null, 'x'] }), clock());
		assert.deepEqual(store.list().map(chat => chat.id), ['ok']);

		for (let index = 0; index < MAX_CHATS + 5; index++) {
			const chat = store.create();
			store.appendTurn(chat.id, [{ role: 'user', content: `chat ${index}` }], []);
		}
		assert.ok(store.list().length <= MAX_CHATS);
		assert.equal(store.list()[0].title, `chat ${MAX_CHATS + 4}`);
	});
});
