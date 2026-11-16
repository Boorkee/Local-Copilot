import type { ChatMessage } from './ollamaClient';

/** Keep the most recent conversation context within a predictable request budget. */
export function recentContext(history: readonly ChatMessage[], maxMessages = 20, maxCharacters = 24_000): ChatMessage[] {
    const selected: ChatMessage[] = [];
    let remaining = maxCharacters;
    for (let index = history.length - 1; index >= 0 && selected.length < maxMessages && remaining > 0; index--) {
        const message = history[index];
        if (!message.content) continue;
        if (message.content.length > remaining) {
            if (selected.length) break;
            const note = '[Older content omitted]\n';
            selected.push({ role: message.role, content: remaining <= note.length
                ? message.content.slice(-remaining)
                : note + message.content.slice(-(remaining - note.length)) });
            break;
        }
        selected.push({ role: message.role, content: message.content });
        remaining -= message.content.length;
    }
    return selected.reverse();
}
