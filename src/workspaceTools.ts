import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
    allowedTools?: ReadonlySet<string>;
};

const MAX_READ_BYTES = 200_000;
const MAX_LIST_ENTRIES = 500;
const MAX_SEARCH_BYTES = 3_000_000;
const MAX_RANGE_BYTES = 20_000;
const execFileAsync = promisify(execFile);
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'out', 'out-test']);

export const workspaceToolDefinitions: ToolDefinition[] = [
    { type: 'function', function: { name: 'run_command', description: 'Run a shell command, build, or test in the workspace. Always requires explicit user approval. Commands run in Windows PowerShell on Windows and /bin/sh elsewhere. Use noninteractive commands.', parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string', description: 'Workspace-relative directory; defaults to root.' } }, required: ['command'] } } },
    { type: 'function', function: { name: 'editor_context', description: 'Read the active VS Code file and selection.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'get_diagnostics', description: 'Read VS Code errors and warnings for a workspace file.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'open_file', description: 'Open a workspace file in VS Code.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'search_workspace', description: 'Find text in project files. Results include paths, line numbers and short excerpts; matches are capped.', parameters: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string', description: 'Optional directory to search' }, maxResults: { type: 'integer', minimum: 1, maximum: 50 } }, required: ['query'] } } },
    { type: 'function', function: { name: 'read_file_range', description: 'Read numbered lines from a text file instead of loading its entire contents.', parameters: { type: 'object', properties: { path: { type: 'string' }, startLine: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 } }, required: ['path', 'startLine', 'endLine'] } } },
    { type: 'function', function: { name: 'replace_in_file', description: 'Replace exactly one occurrence of oldText with newText in an existing file, after a user-reviewed diff. Prefer over full-file rewrites.', parameters: { type: 'object', properties: { path: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' } }, required: ['path', 'oldText', 'newText'] } } },
    { type: 'function', function: { name: 'get_git_diff', description: 'Read a bounded git diff for tracked worktree and staged changes without modifying files.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Optional workspace-relative path' } } } } },
    { type: 'function', function: { name: 'list_symbols', description: 'Get VS Code document symbols and line numbers for a workspace file.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'get_workspace_diagnostics', description: 'Get a bounded list of IDE errors and warnings for the workspace.', parameters: { type: 'object', properties: {} } } },
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

export const READ_ONLY_TOOLS = new Set([
    'editor_context', 'get_diagnostics', 'get_workspace_diagnostics', 'list_symbols', 'open_file',
    'list_files', 'read_file', 'read_file_range', 'search_workspace', 'get_git_diff'
]);

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

    /** The host uses the same symlink and workspace checks for clickable file references. */
    async resolveWorkspaceFile(file: string): Promise<string> {
        const { absolute } = await this.resolve(file);
        if (!(await fs.stat(absolute)).isFile()) throw new Error('The requested path is not a workspace file.');
        return absolute;
    }

	async execute(name: string, rawArguments: Record<string, unknown> | string): Promise<string> {
		try {
            this.options.assertActive?.();
            if (this.options.allowedTools && !this.options.allowedTools.has(name))
                throw new Error(`${name} is not permitted in read-only Plan mode.`);
			const args = typeof rawArguments === 'string'
				? (JSON.parse(rawArguments || '{}') as Record<string, unknown>)
				: rawArguments ?? {};
			if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object.');
			switch (name) {
				case 'run_command': {
                    if (!this.options.runCommand) throw new Error('Command execution is unavailable in this host.');
                    const { absolute } = await this.resolve(args.cwd === undefined ? '.' : this.requireString(args.cwd, 'cwd'));
                    if (!(await fs.stat(absolute)).isDirectory()) throw new Error('Command cwd must be a directory.');
                    return await this.options.runCommand(this.requireString(args.command, 'command'), absolute);
                }
                case 'editor_context':
                case 'get_diagnostics':
                case 'open_file':
                case 'list_symbols':
                case 'get_workspace_diagnostics': {
                    if (!this.options.editorAction) throw new Error('VS Code editor tools are unavailable in this host.');
                    const absolute = name === 'editor_context' || name === 'get_workspace_diagnostics' ? undefined :
                        (await this.resolve(this.requireString(args.path, 'path'))).absolute;
                    return await this.options.editorAction(name, absolute);
                }
				case 'search_workspace':
					return await this.searchWorkspace(this.requireString(args.query, 'query'), args.path === undefined ? '.' : this.requireString(args.path, 'path'), args.maxResults);
				case 'read_file_range':
					return await this.readFileRange(this.requireString(args.path, 'path'), args.startLine, args.endLine);
				case 'replace_in_file':
					return await this.replaceInFile(this.requireString(args.path, 'path'), this.requireString(args.oldText, 'oldText'), this.requireString(args.newText, 'newText'));
				case 'get_git_diff':
					return await this.getGitDiff(args.path === undefined ? '.' : this.requireString(args.path, 'path'));
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
			if (Buffer.byteLength(unsaved) > MAX_READ_BYTES || unsaved.includes('\0')) throw new Error('Unsaved file is too large or binary.');
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

    async readFileRange(file: string, from: unknown, to: unknown): Promise<string> {
        if (!Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 1 ||
            (to as number) < (from as number) || (to as number) - (from as number) > 249)
            throw new Error('Line range must contain 1–250 lines, starting at line 1 or later.');
        const { absolute, rootReal } = await this.resolve(file);
        const stat = await fs.stat(absolute);
        if (!stat.isFile() || stat.size > 2_000_000) throw new Error('File is not a readable text file under 2 MB.');
        const content = this.options.openDocuments?.readUnsaved(absolute) ?? await fs.readFile(absolute, 'utf8');
        if (Buffer.byteLength(content) > 2_000_000 || content.includes('\0')) throw new Error('Cannot read a large or binary file.');
        const lines = content.split(/\r?\n/);
        const start = from as number;
        if (start > lines.length) throw new Error(`File has only ${lines.length} lines.`);
        const selected = lines.slice(start - 1, to as number).map((text, index) => `${start + index}: ${text}`);
        let result = selected.join('\n');
        const truncated = Buffer.byteLength(result) > MAX_RANGE_BYTES;
        if (truncated) result = result.slice(0, MAX_RANGE_BYTES);
        return JSON.stringify({ path: this.display(rootReal, absolute), startLine: start, endLine: Math.min(to as number, lines.length),
            text: result, truncated, totalLines: lines.length });
    }

    async searchWorkspace(query: string, directory = '.', maxResults: unknown = 30): Promise<string> {
        if (!query || query.length > 200 || query.includes('\0')) throw new Error('Search text must contain 1–200 characters.');
        if (!Number.isInteger(maxResults) || (maxResults as number) < 1 || (maxResults as number) > 50)
            throw new Error('maxResults must be an integer from 1 to 50.');
        const { absolute, rootReal } = await this.resolve(directory);
        if (!(await fs.stat(absolute)).isDirectory()) throw new Error('Search path must be a directory.');
        const matches: Array<{ path: string; line: number; excerpt: string }> = [];
        let bytes = 0;
        let files = 0;
        let truncated = false;
        const needle = query.toLocaleLowerCase();
        const walk = async (folder: string): Promise<void> => {
            const entries = await fs.readdir(folder, { withFileTypes: true });
            entries.sort((a, b) => a.name.localeCompare(b.name));
            for (const entry of entries) {
                this.options.assertActive?.();
                if (matches.length >= (maxResults as number) || files >= 2000 || bytes >= MAX_SEARCH_BYTES) {
                    truncated = true;
                    return;
                }
                if (entry.isSymbolicLink()) continue;
                const target = path.join(folder, entry.name);
                if (entry.isDirectory()) {
                    if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(target);
                } else if (entry.isFile()) {
                    const stat = await fs.stat(target);
                    if (stat.size > MAX_READ_BYTES || bytes + stat.size > MAX_SEARCH_BYTES) continue;
                    const content = this.options.openDocuments?.readUnsaved(target) ?? await fs.readFile(target, 'utf8');
                    const size = Buffer.byteLength(content);
                    if (size > MAX_READ_BYTES || bytes + size > MAX_SEARCH_BYTES || content.includes('\0')) continue;
                    files++;
                    bytes += size;
                    for (const [index, line] of content.split(/\r?\n/).entries()) {
                        if (line.toLocaleLowerCase().includes(needle)) {
                            matches.push({ path: this.display(rootReal, target), line: index + 1, excerpt: line.slice(0, 240) });
                            if (matches.length >= (maxResults as number)) { truncated = true; break; }
                        }
                    }
                }
            }
        };
        await walk(absolute);
        return JSON.stringify({ matches, filesScanned: files, truncated });
    }

    async replaceInFile(file: string, oldText: string, newText: string): Promise<string> {
        if (!oldText || oldText.length > MAX_READ_BYTES) throw new Error('oldText must be nonempty and under 200 KB.');
        const before = await this.readFile(file);
        const first = before.indexOf(oldText);
        if (first === -1) throw new Error('oldText was not found. Read the latest file content first.');
        if (before.indexOf(oldText, first + oldText.length) !== -1) throw new Error('oldText is ambiguous. Include more context to match only once.');
        return this.writeFile(file, before.slice(0, first) + newText + before.slice(first + oldText.length), before);
    }

    async getGitDiff(requested = '.'): Promise<string> {
        const { absolute } = await this.resolve(requested);
        const args = ['diff', '--no-ext-diff', '--no-textconv', '--no-color'];
        const run = async (staged: boolean): Promise<string> => {
            const { stdout } = await execFileAsync('git', [...args, ...(staged ? ['--cached'] : []), '--', absolute],
                { cwd: this.root, timeout: 5000, maxBuffer: 35_000, windowsHide: true });
            return stdout.slice(0, 30_000);
        };
        const [unstaged, staged] = await Promise.all([run(false), run(true)]);
        return JSON.stringify({ unstaged, staged, truncated: unstaged.length >= 30_000 || staged.length >= 30_000 });
    }

	async writeFile(file: string, content: string, expectedContent?: string): Promise<string> {
		const { absolute, rootReal } = await this.resolve(file, true);
		const relative = this.display(rootReal, absolute);
        if (Buffer.byteLength(content) > MAX_READ_BYTES) throw new Error('Write is too large; keep reviewed files under 200 KB.');
		if (expectedContent !== undefined) {
            const current = this.options.openDocuments?.readUnsaved(absolute) ?? await fs.readFile(absolute, 'utf8');
            if (current !== expectedContent) throw new Error(`${relative} changed while preparing the patch. Read it again.`);
        }
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
		if (expectedContent !== undefined && !this.options.confirmWrite) {
            const current = this.options.openDocuments?.readUnsaved(absolute) ?? await fs.readFile(absolute, 'utf8');
            if (current !== expectedContent) throw new Error(`${relative} changed before writing the patch.`);
        }
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
