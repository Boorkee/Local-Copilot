import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { VoiceInput } from './voiceInput';
import * as vscode from 'vscode';
import { runAgent } from './agent';
import { runCommand } from './commandRunner';
import { fileReview, ReviewQueue } from './reviewQueue';
import { createChatViewHtml } from './chatViewHtml';
import { Chat, ChatStore, TranscriptEntry } from './chatStore';
import { replaceEditorText } from './editorActions';
import { delegateCodingTask } from './orchestrator';
import { ChatMessage, OllamaClient } from './ollamaClient';
import { OpenDocuments, WorkspaceTools, WriteProposal } from './workspaceTools';
import { HostEvent, parseWebviewMessage, WebviewMessage } from './protocol';

function samePath(a: string, b: string): boolean {
	const normalize = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
	return normalize(a) === normalize(b);
}

function findDirtyDocument(absolutePath: string): vscode.TextDocument | undefined {
	return vscode.workspace.textDocuments.find(
		document => document.uri.scheme === 'file' && document.isDirty && samePath(document.uri.fsPath, absolutePath)
	);
}

// Files with unsaved edits are read from, and written to, the editor buffer so nothing the user typed is lost.
const unsavedDocuments: OpenDocuments = {
	readUnsaved: absolutePath => findDirtyDocument(absolutePath)?.getText(),
	writeUnsaved: async (absolutePath, content) => {
		const document = findDirtyDocument(absolutePath);
		if (!document) {
			return false;
		}
		const edit = new vscode.WorkspaceEdit();
		edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), content);
		return vscode.workspace.applyEdit(edit);
	}
};

type ChatTurn = { transcript: TranscriptEntry[]; history: ChatMessage[] };

type ChatPickItem = vscode.QuickPickItem & { chatId: string };

class ChatViewProvider implements vscode.WebviewViewProvider {
	private view: vscode.WebviewView | undefined;
	private client: OllamaClient;
	private readonly store: ChatStore;
	private busy = false;
	private taskId: string | undefined;
	private pending: { chatId: string; prompt: string } | undefined;
	private status = '';
	private readonly voice: VoiceInput;
	private readonly extensionUri: vscode.Uri;
    private readonly reviews = new ReviewQueue(review => this.post({ type: 'review', review: review ?? null }));
    private taskController?: AbortController;
    private commandOutput = '';
    private connection: 'loading' | 'ready' | 'empty' | 'error' = 'loading';
    private connectionError = '';

	constructor(context: vscode.ExtensionContext) {
		this.extensionUri = context.extensionUri;
		this.voice = new VoiceInput(vscode.Uri.joinPath(context.extensionUri, 'resources', 'speech.ps1').fsPath, event => this.post(event));
		context.subscriptions.push(this.voice, { dispose: () => this.stopTask() });
		this.store = new ChatStore(context.globalState);
		this.client = this.createClient();
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('localCopilot.ollamaBaseUrl')
				|| event.affectsConfiguration('localCopilot.requestTimeoutMs')) {
				this.client = this.createClient();
			}
		}, undefined, context.subscriptions);
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out')]
		};
		webviewView.webview.html = createChatViewHtml(webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'out', 'effects.js')).toString());
		webviewView.onDidChangeVisibility(() => {
			if (!webviewView.visible) this.voice.stop();
		});
		const messageSubscription = webviewView.webview.onDidReceiveMessage((value: unknown) => {
			const message = parseWebviewMessage(value);
			if (message) void this.handleMessage(message);
		});
		webviewView.onDidDispose(() => {
			messageSubscription.dispose();
            this.stopTask();
			this.voice.stop();
			if (this.view === webviewView) {
				this.view = undefined;
			}
		});
	}

	newChat(): void {
        this.stopTask();
		this.voice.stop();
		this.store.create();
		this.postState();
		void vscode.commands.executeCommand('localCopilot.chat.focus');
	}

	showChats(): void {
		const pick = vscode.window.createQuickPick<ChatPickItem>();
		pick.title = 'Local Copilot chats';
		pick.placeholder = 'Select a chat to open';
		pick.matchOnDescription = true;
		const refreshItems = () => {
			pick.items = this.store.list().map(summary => ({
				label: summary.title,
				description: new Date(summary.updatedAt).toLocaleString(),
				chatId: summary.id,
				buttons: [{ iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Delete chat' }]
			}));
		};
		refreshItems();
		pick.onDidTriggerItemButton(event => {
			this.stopTask();
			this.store.delete(event.item.chatId);
			refreshItems();
			this.postState();
		});
		pick.onDidAccept(() => {
			const item = pick.selectedItems[0];
			if (item) {
				this.voice.stop();
				this.stopTask();
				this.store.select(item.chatId);
				this.postState();
				void vscode.commands.executeCommand('localCopilot.chat.focus');
			}
			pick.hide();
		});
		pick.onDidHide(() => pick.dispose());
		pick.show();
	}

	private createClient(): OllamaClient {
		const configuration = vscode.workspace.getConfiguration('localCopilot');
		return new OllamaClient(
			configuration.get<string>('ollamaBaseUrl', 'http://127.0.0.1:11434'),
			configuration.get<number>('requestTimeoutMs', 300000)
		);
	}

	private postState(): void {
		const chat = this.store.active();
		if (this.view) {
			this.view.description = chat.transcript.length ? chat.title : undefined;
		}
		const pending = this.busy && this.pending?.chatId === chat.id ? { prompt: this.pending.prompt } : undefined;
		this.post({ type: 'state', chat, busy: this.busy, pending, status: this.status, review: this.reviews.current ?? null, commandOutput: this.commandOutput,
            taskId: pending ? this.taskId : undefined });
	}

	private setStatus(text: string): void {
		this.status = text;
		this.post({ type: 'status', text });
	}

	/** Runs one model turn against the open chat and saves it, even if the view is closed meanwhile. */
	private async runTurn(prompt: string, work: (chat: Chat) => Promise<ChatTurn>): Promise<void> {
		if (this.busy) {
			this.post({ type: 'error', text: 'Wait for the current request to finish.', prompt });
			return;
		}
		this.voice.stop();
		const chat = this.store.active();
		this.busy = true;
		const taskId = randomUUID();
		this.taskId = taskId;
		this.pending = { chatId: chat.id, prompt };
		this.taskController = new AbortController();
        this.commandOutput = '';
        this.setStatus('Thinking…');
        this.postState();
		this.post({ type: 'taskStarted', taskId, sessionId: chat.id });
		let failure: string | undefined;
		try {
			const turn = await work(chat);
			this.taskController.signal.throwIfAborted();
			this.store.appendTurn(chat.id, turn.transcript, turn.history);
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
            if (/does not support tools/i.test(failure)) failure += ' Choose a tool-capable Code model for Agent mode, or use Chat mode for this model.';
		}
		const cancelled = this.taskController.signal.aborted;
		this.reviews.cancel();
        this.taskController = undefined;
		this.busy = false;
		this.taskId = undefined;
		this.pending = undefined;
		this.status = '';
		this.postState();
		this.post({ type: 'taskFinished', taskId, sessionId: chat.id, status: cancelled ? 'cancelled' : failure ? 'failed' : 'done' });
		if (failure !== undefined && this.store.active().id === chat.id && !cancelled) {
			this.post({ type: 'error', text: failure, prompt });
		}
	}

	private async handleMessage(message: WebviewMessage): Promise<void> {
		try {
			switch (message.type) {
				case 'startVoice':
					if (!this.busy && this.view?.visible) this.voice.start();
					break;
				case 'stopVoice':
					this.voice.stop();
					break;
				case 'reviewDecision':
                    this.reviews.decide(message.id, message.approved === true);
                    break;
                case 'stopTask':
                    this.stopTask();
                    break;
                case 'openSettings':
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'localCopilot.ollamaBaseUrl');
                    break;
                case 'ready':
					this.postState();
                    this.post({ type: 'connection', state: this.connection, text: this.connectionError });
					await this.refreshModels();
					break;
				case 'refreshModels':
					await this.refreshModels();
					break;
				case 'sendMessage': {
					const prompt = message.prompt.trim();
					if (!prompt || !message.model.trim()) {
						throw new Error('Choose a model and enter a message before sending.');
					}

                    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    const agentMode = message.mode !== 'chat';
                    if (agentMode && (!root || !vscode.workspace.isTrusted)) {
                        throw new Error('Open and trust a workspace folder to use Agent mode, or select Chat for conversation only.');
                    }
                    const model = agentMode ? message.codeModel?.trim() : message.model.trim();
                    if (!model) throw new Error('Select a code model with tool-calling support for Agent mode.');
                    await this.runTurn(prompt, async chat => {
                        const tools = agentMode ? this.createTools(root!) : undefined;
                        let content: string;
                        try {
                            content = tools
                                ? (await runAgent({ client: this.client, model, task: prompt, history: chat.history.slice(-20), tools,
                                    signal: this.taskController!.signal, onProgress: text => this.setStatus(text) })).summary
                                : await this.client.chat(model, prompt, [...chat.history]);
                        } catch (error) {
                            if (!tools?.changes.length) throw error;
                            content = `Task incomplete: ${error instanceof Error ? error.message : String(error)}. Previously kept file changes remain applied.`;
                        }
                        return {
                            transcript: [{ role: 'user', content: prompt }, { role: 'assistant', content, changes: tools?.changes }],
                            history: [{ role: 'user', content: prompt }, { role: 'assistant', content }]
                        };
                    });
					break;
				}
				case 'delegate': {
					const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
					if (!root) {
						throw new Error('Open a workspace folder before delegating a coding task.');
					}
					const task = message.task.trim();
					const chatModel = message.chatModel.trim();
					const codeModel = message.codeModel.trim();
					if (!task || !chatModel || !codeModel) {
						throw new Error('Choose a chat model and a code model, and describe the task.');
					}
					await this.runTurn(message.prompt, async chat => {
						const result = await delegateCodingTask({
							client: this.client,
							chatModel,
							codeModel,
							task,
							history: chat.history,
							tools: this.createTools(root),
                            signal: this.taskController!.signal,
							onProgress: text => this.setStatus(text)
						});
						return {
							transcript: [
								{ role: 'user', content: message.prompt },
								{ role: 'assistant', content: result.update, changes: result.changes.length ? result.changes : undefined }
							],
							history: result.historyAdditions
						};
					});
					break;
				}
				case 'applyCode':
					await this.applyToActiveEditor(message.code);
					break;
				case 'copyCode':
					await vscode.env.clipboard.writeText(message.code);
					this.setStatus('Copied to the clipboard.');
					break;
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			this.post({ type: 'error', text: detail, prompt: 'prompt' in message ? message.prompt : undefined });
		}
	}


    private stopTask(): void {
        this.taskController?.abort(new Error('Task stopped by the user.'));
        this.reviews.cancel();
        if (this.busy) this.client.cancelRequests();
    }

    private createTools(root: string): WorkspaceTools {
        const signal = this.taskController?.signal;
        const assertActive = () => {
            signal?.throwIfAborted();
            if (!vscode.workspace.isTrusted) throw new Error('Workspace trust is required for agent tools.');
        };
        return new WorkspaceTools(root, {
            assertActive,
            openDocuments: unsavedDocuments,
            confirmWrite: proposal => this.reviewWrite(proposal),
            confirmDelete: (file, before) => this.reviews.request(fileReview('delete', file, before ?? '', '')),
            runCommand: async (command, cwd) => {
                assertActive();
                if (!command.trim() || command.length > 10000) throw new Error('Command must contain 1–10000 characters.');
                const shell = process.platform === 'win32' ? 'Windows PowerShell' : '/bin/sh';
                const approved = await this.reviews.request({ kind: 'command', title: command,
                    detail: `${shell} · ${cwd}\nRuns with your account permissions. Commands can modify files; their changes are not covered by Keep/Revert.` });
                assertActive();
                if (!approved) return 'The user rejected this command. Do not run it or an alternative without a new user request.';
                this.commandOutput = '';
                this.post({ type: 'commandOutput', text: '', reset: true });
                this.setStatus('Running approved command…');
                const result = await runCommand(command, cwd, signal ?? new AbortController().signal, text => {
                    this.commandOutput = (this.commandOutput + text).slice(-64000);
                    this.post({ type: 'commandOutput', text });
                });
                this.commandOutput = result;
                this.post({ type: 'commandOutput', text: result, reset: true });
                return result;
            },
            editorAction: async (action, absolute) => {
                assertActive();
                if (action === 'editor_context') {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor || !vscode.workspace.getWorkspaceFolder(editor.document.uri)
                        || !samePath(vscode.workspace.getWorkspaceFolder(editor.document.uri)!.uri.fsPath, root)) return 'No active editor in this workspace.';
                    return JSON.stringify({ path: path.relative(root, editor.document.uri.fsPath),
                        selection: editor.document.getText(editor.selection).slice(0, 20000),
                        content: editor.document.getText().slice(0, 50000), dirty: editor.document.isDirty });
                }
                const uri = vscode.Uri.file(absolute!);
                if (action === 'open_file') {
                    await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: true });
                    return 'Opened file in VS Code.';
                }
                return JSON.stringify(vscode.languages.getDiagnostics(uri).slice(0, 100).map(d => ({
                    line: d.range.start.line + 1, severity: vscode.DiagnosticSeverity[d.severity], message: d.message
                })));
            }
        });
    }

    private reviewWrite(proposal: WriteProposal): Promise<boolean> {
        return this.reviews.request(fileReview('write', proposal.path, proposal.before ?? '', proposal.after));
    }


    private async refreshModels(): Promise<void> {
        this.connection = 'loading';
        this.connectionError = '';
        this.post({ type: 'connection', state: 'loading' });
        try {
            const models = await this.client.listModels();
            this.connection = models.length ? 'ready' : 'empty';
            this.connectionError = models.length ? '' : 'Ollama is connected but has no models. Pull a tool-capable coding model, then retry.';
            this.post({ type: 'models', models: models.map(model => model.name).filter(Boolean),
                defaultModel: vscode.workspace.getConfiguration('localCopilot').get<string>('defaultModel', 'qwen2.5-coder:7b'),
                defaultCodeModel: vscode.workspace.getConfiguration('localCopilot').get<string>('codeModel', 'qwen2.5-coder:14b') });
            this.post({ type: 'connection', state: this.connection, text: this.connectionError });
        } catch (error) {
            this.connection = 'error';
            this.connectionError = error instanceof Error ? error.message : String(error);
            this.post({ type: 'connection', state: 'error', text: this.connectionError });
        }
    }

	private async applyToActiveEditor(code: string): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			throw new Error('Open a text editor before applying a response.');
		}

        if (this.busy || this.reviews.current) {
            this.setStatus('Finish or stop the current task before applying another response.');
            return;
        }
        const before = editor.document.getText();
        if (Buffer.byteLength(before) > 200000 || Buffer.byteLength(code) > 200000) throw new Error('File is too large for inline review.');
        const selection = editor.selection;
        const start = selection.isEmpty ? 0 : editor.document.offsetAt(selection.start);
        const end = selection.isEmpty ? before.length : editor.document.offsetAt(selection.end);
        const after = before.slice(0, start) + code + before.slice(end);
        if (!await this.reviewWrite({ path: vscode.workspace.asRelativePath(editor.document.uri), before, after })) return;
        if (editor.document.isClosed || editor.document.getText() !== before) throw new Error('The editor changed during review. Apply again to review the current version.');

		await replaceEditorText(
			editor.document,
			selection,
			(start, end) => new vscode.Range(start, end),
			(range, text) => editor.edit(editBuilder => editBuilder.replace(range, text)),
			code
		);
		this.setStatus('Response applied to the active editor.');
	}

	private post(message: HostEvent): void {
		void this.view?.webview.postMessage(message);
	}

}

export function activate(context: vscode.ExtensionContext): void {
	const provider = new ChatViewProvider(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('localCopilot.chat', provider, {
			webviewOptions: { retainContextWhenHidden: true }
		}),
		vscode.commands.registerCommand('localCopilot.newChat', () => provider.newChat()),
		vscode.commands.registerCommand('localCopilot.showChats', () => provider.showChats())
	);
}

export function deactivate(): void {}
