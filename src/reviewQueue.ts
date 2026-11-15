import { randomUUID } from 'node:crypto';
import { diffLines } from 'diff';

export type ReviewCard = {
    id: string;
    kind: 'write' | 'delete' | 'command';
    title: string;
    detail?: string;
    added?: number;
    removed?: number;
    lines?: Array<{ kind: 'add' | 'remove' | 'context'; text: string }>;
};

export function fileReview(kind: 'write' | 'delete', file: string, before: string, after: string): Omit<ReviewCard, 'id'> {
    const parts = diffLines(before, after, { timeout: 500 });
    if (!parts) throw new Error('This diff is too complex to review inline. Split the edit into smaller changes.');
    let added = 0, removed = 0;
    const lines: NonNullable<ReviewCard['lines']> = [];
    for (const part of parts) {
        if (part.added) added += part.count ?? 0;
        if (part.removed) removed += part.count ?? 0;
        const rows = part.value.split('\n');
        if (rows.at(-1) === '') rows.pop();
        // Show all changed lines and limited surrounding context for large files.
        const visible = !part.added && !part.removed && rows.length > 6
            ? [...rows.slice(0, 3), `… ${rows.length - 6} unchanged lines …`, ...rows.slice(-3)] : rows;
        for (const text of visible) lines.push({ kind: part.added ? 'add' : part.removed ? 'remove' : 'context', text });
    }
    return { kind, title: file, added, removed, lines };
}

/** The host owns approvals; stale or forged IDs cannot approve another action. */
export class ReviewQueue {
    current?: ReviewCard;
    private resolve?: (approved: boolean) => void;
    constructor(private readonly changed: (card?: ReviewCard) => void) {}
    request(card: Omit<ReviewCard, 'id'>): Promise<boolean> {
        if (this.current) return Promise.reject(new Error('Another action is already awaiting review.'));
        this.current = { ...card, id: randomUUID() };
        return new Promise(resolve => { this.resolve = resolve; this.changed(this.current); });
    }
    decide(id: string, approved: boolean): void {
        if (this.current?.id !== id) return;
        const resolve = this.resolve;
        this.current = undefined;
        this.resolve = undefined;
        this.changed();
        resolve?.(approved);
    }
    cancel(): void { if (this.current) this.decide(this.current.id, false); }
}
