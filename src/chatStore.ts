import { randomUUID } from 'node:crypto';
import { ChatMessage } from './ollamaClient';

export type TranscriptEntry = {
	role: 'user' | 'assistant';
	content: string;
	steps?: Array<{ id: string; summary: string; status: 'started' | 'done' | 'failed' }>;
	/** Files the code model changed during this turn, shown under the reply. */
	changes?: Array<{ action: 'write' | 'delete'; path: string }>;
};

export type Chat = {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	/** Messages sent to the model, including hidden hand-off reports. */
	history: ChatMessage[];
	/** Messages shown to the user. */
	transcript: TranscriptEntry[];
    /** Stored before model activity so unexpected restarts can be explained on next launch. */
    inFlight?: { id: string; prompt: string; startedAt: number };
};

export type ChatSummary = Pick<Chat, 'id' | 'title' | 'updatedAt'>;

/** The subset of vscode.Memento the store needs. */
export type Storage = {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): PromiseLike<void>;
};

const CHATS_KEY = 'localCopilot.chats';
const ACTIVE_KEY = 'localCopilot.activeChat';
export const MAX_CHATS = 50;
const TITLE_LENGTH = 48;

function makeTitle(prompt: string): string {
	const single = prompt.replace(/\s+/g, ' ').trim();
	return single.length > TITLE_LENGTH ? `${single.slice(0, TITLE_LENGTH - 1)}…` : single || 'New chat';
}

/** Persists chats so they survive the view being moved, hidden, or VS Code restarting. */
export class ChatStore {
	private chats: Chat[];
	private activeId: string | undefined;

	constructor(private readonly storage: Storage, private readonly now: () => number = Date.now) {
		const saved = storage.get<Chat[]>(CHATS_KEY);
		this.chats = Array.isArray(saved) ? saved.filter(ChatStore.isChat) : [];
		this.activeId = storage.get<string>(ACTIVE_KEY);
        let recovered = false;
        for (const chat of this.chats) {
            if (!chat.inFlight) continue;
            if (typeof chat.inFlight.prompt !== 'string' || typeof chat.inFlight.id !== 'string') {
                delete chat.inFlight;
                recovered = true;
                continue;
            }
            const summary = 'Previous task was interrupted when VS Code closed. It was not resumed automatically; previously approved changes may remain.';
            chat.transcript.push({ role: 'user', content: chat.inFlight.prompt }, { role: 'assistant', content: summary });
            chat.history.push({ role: 'user', content: chat.inFlight.prompt }, { role: 'assistant', content: summary });
            chat.updatedAt = this.now();
            delete chat.inFlight;
            recovered = true;
        }
        if (recovered) this.persist();
	}

	private static isChat(value: unknown): value is Chat {
		const chat = value as Chat;
		return Boolean(chat) && typeof chat.id === 'string' && typeof chat.title === 'string'
			&& Array.isArray(chat.history) && Array.isArray(chat.transcript);
	}

	list(): ChatSummary[] {
		return [...this.chats]
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
	}

	get(id: string): Chat | undefined {
		return this.chats.find(chat => chat.id === id);
	}

	/** The open chat; creates one when none exists. */
	active(): Chat {
		return (this.activeId ? this.get(this.activeId) : undefined) ?? this.create();
	}

	select(id: string): Chat | undefined {
		const chat = this.get(id);
		if (chat) {
			this.activeId = id;
			void this.storage.update(ACTIVE_KEY, id);
		}
		return chat;
	}

    rename(id: string, title: string): boolean {
        const chat = this.get(id);
        const clean = title.replace(/\s+/g, ' ').trim();
        if (!chat || !clean) return false;
        chat.title = makeTitle(clean);
        chat.updatedAt = this.now();
        this.persist();
        return true;
    }

    beginTask(id: string, taskId: string, prompt: string): void {
        const chat = this.get(id);
        if (!chat) return;
        chat.inFlight = { id: taskId, prompt, startedAt: this.now() };
        this.persist();
    }

    finishTask(id: string, taskId: string): void {
        const chat = this.get(id);
        if (chat?.inFlight?.id !== taskId) return;
        delete chat.inFlight;
        this.persist();
    }

	/** Starts a new chat, reusing the open one if it is still empty. */
	create(): Chat {
		const current = this.activeId ? this.get(this.activeId) : undefined;
		if (current && current.transcript.length === 0 && !current.inFlight) {
			return current;
		}
		const timestamp = this.now();
		const chat: Chat = { id: randomUUID(), title: 'New chat', createdAt: timestamp, updatedAt: timestamp, history: [], transcript: [] };
		this.chats.push(chat);
		this.activeId = chat.id;
		if (this.chats.length > MAX_CHATS) {
			const oldest = [...this.chats]
				.filter(candidate => candidate.id !== chat.id)
				.sort((a, b) => a.updatedAt - b.updatedAt)[0];
			this.chats = this.chats.filter(candidate => candidate !== oldest);
		}
		this.persist();
		return chat;
	}

	delete(id: string): Chat {
		this.chats = this.chats.filter(chat => chat.id !== id);
		if (this.activeId === id) {
			const [latest] = this.list();
			this.activeId = latest?.id;
		}
		this.persist();
		return this.active();
	}

	/** Records a finished turn. Returns false if the chat was deleted in the meantime. */
	appendTurn(id: string, transcript: TranscriptEntry[], history: ChatMessage[]): boolean {
		const chat = this.get(id);
		if (!chat) {
			return false;
		}
		if (chat.transcript.length === 0 && chat.title === 'New chat') {
			const firstUser = transcript.find(entry => entry.role === 'user');
			chat.title = makeTitle(firstUser?.content ?? '');
		}
		chat.transcript.push(...transcript);
		chat.history.push(...history);
		chat.updatedAt = this.now();
		this.persist();
		return true;
	}

	private persist(): void {
		void this.storage.update(CHATS_KEY, this.chats);
		void this.storage.update(ACTIVE_KEY, this.activeId);
	}
}
