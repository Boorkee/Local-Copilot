import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ToolDefinition } from './ollamaClient';

export type FileChange = {
	action: 'write' | 'delete';
	path: string;
};

export type WriteProposal = {
	path: string;
	before: string | undefined;
	after: string;
};

export type OpenDocuments = {
	/** Returns the unsaved text of a file that has unsaved edits in an editor, otherwise undefined. */
	readUnsaved(absolutePath: string): string | undefined;
	/** Replaces the text of an editor with unsaved edits without saving; returns false if the file has none. */
	writeUnsaved(absolutePath: string, content: string): Promise<boolean>;
};

export type WorkspaceToolsOptions = {
	confirmDelete?: (relativePath: string, before?: string) => Promise<boolean>;
	/** When set, every write must be approved before it touches disk. */
	confirmWrite?: (proposal: WriteProposal) => Promise<boolean>;
	/** Lets the tools see and update unsaved editor buffers instead of clobbering them on disk. */
	openDocuments?: OpenDocuments;
    runCommand?: (command: string, cwd: string) => Promise<string>;
    editorAction?: (action: string, absolute?: string) => Promise<string>;
    assertActive?: () => void;
};

const MAX_READ_BYTES = 200_000;
const MAX_LIST_ENTRIES = 500;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'out', 'out-test']);

export const workspaceToolDefinitions: ToolDefinition[] = [
    { type: 'function', function: { name: 'run_command', description: 'Run a shell command, build, or test in the workspace. Always requires explicit user approval. Commands run in Windows PowerShell on Windows and /bin/sh elsewhere. Use noninteractive commands.', parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string', description: 'Workspace-relative directory; defaults to root.' } }, required: ['command'] } } },
    { type: 'function', function: { name: 'editor_context', description: 'Read the active VS Code file and selection.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'get_diagnostics', description: 'Read VS Code errors and warnings for a workspace file.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'open_file', description: 'Open a workspace file in VS Code.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
	{
		type: 'function',
		function: {
			name: 'list_files',
			description: 'List files in the workspace (recursively) under a directory. Paths are relative to the workspace root.',
			parameters: {
				type: 'object',
				properties: { path: { type: 'string', description: 'Directory to list; defaults to the workspace root.' } }
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'read_file',
			description: 'Read a UTF-8 text file from the workspace.',
			parameters: {
				type: 'object',
				properties: { path: { type: 'string', description: 'File path relative to the workspace root.' } },
				required: ['path']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'write_file',
			description: 'Create or completely overwrite a UTF-8 text file in the workspace. Parent folders are created.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'File path relative to the workspace root.' },
					content: { type: 'string', description: 'Complete new file contents.' }
				},
				required: ['path', 'content']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'delete_file',
			description: 'Delete a single file from the workspace. Requires user approval.',
			parameters: {
				type: 'object',
				properties: { path: { type: 'string', description: 'File path relative to the workspace root.' } },
				required: ['path']
			}
		}
	}
];

function isInside(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export class WorkspaceTools {
	readonly changes: FileChange[] = [];

	constructor(
		private readonly root: string,
		private readonly options: WorkspaceToolsOptions = {}
	) {}

	async execute(name: string, rawArguments: Record<string, unknown> | string): Promise<string> {
		try {
            this.options.assertActive?.();
			const args = typeof rawArguments === 'string'
				? (JSON.parse(rawArguments || '{}') as Record<string, unknown>)
				: rawArguments ?? {};
			switch (name) {
				case 'run_command': {
                    if (!this.options.runCommand) throw new Error('Command execution is unavailable in this host.');
                    const { absolute } = await this.resolve(args.cwd === undefined ? '.' : this.requireString(args.cwd, 'cwd'));
                    if (!(await fs.stat(absolute)).isDirectory()) throw new Error('Command cwd must be a directory.');
                    return await this.options.runCommand(this.requireString(args.command, 'command'), absolute);
                }
                case 'editor_context':
                case 'get_diagnostics':
                case 'open_file': {
                    if (!this.options.editorAction) throw new Error('VS Code editor tools are unavailable in this host.');
                    const absolute = name === 'editor_context' ? undefined : (await this.resolve(this.requireString(args.path, 'path'))).absolute;
                    return await this.options.editorAction(name, absolute);
                }
                case 'list_files':
					return await this.listFiles(args.path === undefined ? '.' : this.requireString(args.path, 'path'));
				case 'read_file':
					return await this.readFile(this.requireString(args.path, 'path'));
				case 'write_file':
					return await this.writeFile(this.requireString(args.path, 'path'), this.requireString(args.content, 'content'));
				case 'delete_file':
					return await this.deleteFile(this.requireString(args.path, 'path'));
				default:
					return `Error: unknown tool "${name}".`;
			}
		} catch (error) {
			return `Error: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	async listFiles(directory: string): Promise<string> {
		const { absolute, rootReal } = await this.resolve(directory);
		const results: string[] = [];
		const walk = async (current: string): Promise<void> => {
			const entries = await fs.readdir(current, { withFileTypes: true });
			entries.sort((a, b) => a.name.localeCompare(b.name));
			for (const entry of entries) {
				if (results.length >= MAX_LIST_ENTRIES) {
					return;
				}
				const entryPath = path.join(current, entry.name);
				if (entry.isDirectory()) {
					if (!SKIPPED_DIRECTORIES.has(entry.name)) {
						await walk(entryPath);
					}
				} else if (entry.isFile()) {
					results.push(this.display(rootReal, entryPath));
				}
			}
		};
		await walk(absolute);
		return results.length ? results.join('\n') : '(no files)';
	}

	async readFile(file: string): Promise<string> {
		const { absolute } = await this.resolve(file);
		const unsaved = this.options.openDocuments?.readUnsaved(absolute);
		if (unsaved !== undefined) {
			return unsaved;
		}
		const stat = await fs.stat(absolute);
		if (!stat.isFile()) {
			throw new Error(`${file} is not a file.`);
		}
		if (stat.size > MAX_READ_BYTES) {
			throw new Error(`${file} is larger than ${MAX_READ_BYTES} bytes.`);
		}
		return fs.readFile(absolute, 'utf8');
	}

	async writeFile(file: string, content: string): Promise<string> {
		const { absolute, rootReal } = await this.resolve(file, true);
		const relative = this.display(rootReal, absolute);
        if (Buffer.byteLength(content) > MAX_READ_BYTES) throw new Error('Write is too large; keep reviewed files under 200 KB.');
		if (this.options.confirmWrite) {
			let before: string | undefined = this.options.openDocuments?.readUnsaved(absolute);
			try {
				const stat = await fs.stat(absolute);
				if (!stat.isFile()) {
					throw new Error(`${relative} is not a file.`);
				}
				if (stat.size > MAX_READ_BYTES) throw new Error('File is too large to review safely.');
                before ??= await fs.readFile(absolute, 'utf8');
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
					throw error;
				}
			}
			if (!(await this.options.confirmWrite({ path: relative, before, after: content }))) {
				return `The user rejected the change to ${relative}; it was not written.`;
			}
            this.options.assertActive?.();
            await this.resolve(file, true);
            let current = this.options.openDocuments?.readUnsaved(absolute);
            try { current ??= await fs.readFile(absolute, 'utf8'); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
            if (current !== before) throw new Error(`${relative} changed while you reviewed it. Read it again before editing.`);
		}
        this.options.assertActive?.();
		if (!(await this.options.openDocuments?.writeUnsaved(absolute, content))) {
			await fs.mkdir(path.dirname(absolute), { recursive: true });
			await fs.writeFile(absolute, content, 'utf8');
		}
		this.changes.push({ action: 'write', path: relative });
		return `Wrote ${content.length} characters to ${relative}.`;
	}

	async deleteFile(file: string): Promise<string> {
		const { absolute, rootReal } = await this.resolve(file, true);
		const relative = this.display(rootReal, absolute);
		const stat = await fs.stat(absolute);
		if (!stat.isFile()) {
			throw new Error(`${relative} is not a file; only single files can be deleted.`);
		}
		if (this.options.openDocuments?.readUnsaved(absolute) !== undefined) throw new Error('Save or discard unsaved edits before deleting this file.');
        if (stat.size > MAX_READ_BYTES) throw new Error('File is too large to review safely.');
        const before = await fs.readFile(absolute, 'utf8');
		if (!this.options.confirmDelete || !(await this.options.confirmDelete(relative, before))) {
			return `Deletion of ${relative} was not approved.`;
		}
		this.options.assertActive?.();
        await this.resolve(file, true);
        if (this.options.openDocuments?.readUnsaved(absolute) !== undefined || await fs.readFile(absolute, 'utf8') !== before) throw new Error('File changed while deletion was being reviewed.');
		await fs.unlink(absolute);
		this.changes.push({ action: 'delete', path: relative });
		return `Deleted ${relative}.`;
	}

	private requireString(value: unknown, name: string): string {
		if (typeof value !== 'string') {
			throw new Error(`"${name}" must be a string.`);
		}
		return value;
	}

	private display(rootReal: string, absolute: string): string {
		return path.relative(rootReal, absolute).split(path.sep).join('/') || '.';
	}

	private async resolve(requested: string, forModification = false): Promise<{ absolute: string; rootReal: string }> {
		if (!requested.trim()) {
			throw new Error('A path is required.');
		}
		const rootReal = await fs.realpath(this.root);
		const absolute = path.resolve(rootReal, requested);
		if (!isInside(rootReal, absolute)) {
			throw new Error(`${requested} is outside the workspace.`);
		}

		let existing = absolute;
		let real: string | undefined;
		while (real === undefined) {
			try {
				real = await fs.realpath(existing);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(existing) === existing) {
					throw error;
				}
				existing = path.dirname(existing);
			}
		}
		if (!isInside(rootReal, real)) {
			throw new Error(`${requested} resolves outside the workspace.`);
		}

		if (forModification) {
			const relative = path.relative(rootReal, absolute);
			if (relative === '') {
				throw new Error('The workspace root cannot be modified.');
			}
			if ([...relative.split(path.sep), ...path.relative(rootReal, real).split(path.sep)].some(part => part.toLowerCase() === '.git')) {
				throw new Error('The .git directory cannot be modified.');
			}
		}
		return { absolute, rootReal };
	}
}
