import * as path from 'node:path';
import { lstat, readdir, readFile } from 'node:fs/promises';

export type ProjectAgentInfo = { id: string; name: string; description: string };
export type ProjectAgent = ProjectAgentInfo & { instructions: string };

const AGENT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/;
const MAX_AGENT_BYTES = 20_000;
const MAX_AGENT_COUNT = 32;

export function validAgentId(id: string): boolean { return AGENT_NAME.test(id); }

async function agentDirectory(root: string): Promise<string | undefined> {
    const home = path.join(root, '.local-copilot');
    const folder = path.join(home, 'agents');
    for (const target of [home, folder]) {
        const info = await lstat(target).catch(error => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
            throw error;
        });
        if (!info) return undefined;
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Custom agent directory must not be a symlink: ${target}`);
    }
    return folder;
}

function parseAgent(id: string, source: string): ProjectAgent {
    let name = id.replace(/[-_]/g, ' ');
    let description = '';
    let instructions = source.trim();
    if (source.startsWith('---')) {
        const header = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
        if (!header) throw new Error(`${id}: incomplete agent frontmatter.`);
        const seen = new Set<string>();
        for (const line of header[1].split(/\r?\n/)) {
            const field = /^(name|description):\s*(.*)$/.exec(line);
            if (!field || seen.has(field[1])) throw new Error(`${id}: only name and description fields are supported.`);
            seen.add(field[1]);
            const value = field[2].trim().replace(/^(['"])(.*)\1$/, '$2');
            if (field[1] === 'name') name = value;
            else description = value;
        }
        instructions = header[2].trim();
    }
    if (!name || name.length > 80 || description.length > 200 || !instructions || instructions.length > 16_000)
        throw new Error(`${id}: agent name, description, or instructions exceed the limits or are empty.`);
    return { id, name, description, instructions };
}

export async function loadProjectAgent(root: string, id: string): Promise<ProjectAgent> {
    if (!validAgentId(id)) throw new Error('Invalid project agent identifier.');
    const folder = await agentDirectory(root);
    if (!folder) throw new Error('No .local-copilot/agents directory exists in this workspace.');
    const file = path.join(folder, `${id}.agent.md`);
    const stat = await lstat(file).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Project agent ${id} was not found.`);
        throw error;
    });
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_AGENT_BYTES)
        throw new Error(`Project agent ${id} must be a regular Markdown file under ${MAX_AGENT_BYTES} bytes.`);
    const source = await readFile(file, 'utf8');
    if (Buffer.byteLength(source, 'utf8') > MAX_AGENT_BYTES)
        throw new Error(`Project agent ${id} exceeds ${MAX_AGENT_BYTES} bytes.`);
    return parseAgent(id, source);
}

export async function listProjectAgents(root: string): Promise<ProjectAgentInfo[]> {
    const folder = await agentDirectory(root);
    if (!folder) return [];
    const entries = (await readdir(folder, { withFileTypes: true }))
        .filter(entry => entry.name.endsWith('.agent.md'))
        .sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length > MAX_AGENT_COUNT) throw new Error(`Project agents are limited to ${MAX_AGENT_COUNT} files.`);
    const agents: ProjectAgentInfo[] = [];
    for (const entry of entries) {
        const id = entry.name.slice(0, -'.agent.md'.length);
        if (!validAgentId(id) || !entry.isFile() || entry.isSymbolicLink())
            throw new Error(`Invalid custom agent file: ${entry.name}`);
        const { name, description } = await loadProjectAgent(root, id);
        agents.push({ id, name, description });
    }
    return agents;
}
