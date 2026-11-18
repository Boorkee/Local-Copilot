import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SKIPPED_DIRECTORIES } from './workspaceTools';

// Bound both disk work and prompt size when a user selects a whole project.
export const CONTEXT_CHARS = 48_000;
const FILE_CHARS = 6000;

export async function snapshotPath(root: string, budget: number) {
    const stat = await fs.lstat(root);
    const folder = stat.isDirectory();
    const parts: string[] = [];
    let size = 0;
    let files = 0;
    let visited = 0;
    let partial = false;

    async function readFile(file: string) {
        const heading = folder ? path.relative(root, file).split(path.sep).join('/') + '\n' : '';
        const space = budget - size - heading.length - (files ? 2 : 0);
        if (space <= 0) { partial = true; return; }
        const limit = Math.min(space, FILE_CHARS);
        const handle = await fs.open(file, 'r');
        try {
            const buffer = Buffer.alloc(limit * 4 + 1);
            const { bytesRead } = await handle.read(buffer);
            const bytes = buffer.subarray(0, bytesRead);
            if (bytes.includes(0)) { partial = true; return; }
            let source: string;
            try {
                source = new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: bytesRead === buffer.length });
            } catch { partial = true; return; }
            if (source.length > limit || bytesRead === buffer.length) partial = true;
            const part = heading + source.slice(0, limit);
            size += part.length + (files ? 2 : 0);
            parts.push(part);
            files++;
        } finally { await handle.close(); }
    }

    async function walk(dir: string) {
        for await (const entry of await fs.opendir(dir)) {
            if (++visited > 2000 || size >= budget || files >= 200) { partial = true; break; }
            const child = path.join(dir, entry.name);
            try {
                if (entry.isFile()) await readFile(child);
                else if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) await walk(child);
                else partial = true;
            } catch { partial = true; }
        }
    }

    if (folder) await walk(root);
    else if (stat.isFile()) await readFile(root);
    return { content: parts.join('\n\n'), files, folder, partial };
}
