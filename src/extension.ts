import * as path from 'node:path';
import * as vscode from 'vscode';
import { ReviewDecision, createChangeReviewer } from './changeReview';
import { createChatViewHtml } from './chatViewHtml';
import { replaceEditorText } from './editorActions';
import { chatWithDelegation, delegateCodingTask } from './orchestrator';
import { ChatMessage, OllamaClient } from './ollamaClient';
import { OpenDocuments, WorkspaceTools, WriteProposal } from './workspaceTools';

const PROPOSED_SCHEME = 'local-copilot-proposed';

class ProposedContentProvider implements vscode.TextDocumentContentProvider {
	private readonly contents = new Map<string, string>();
	private counter = 0;

	add(relativePath: string, content: string): vscode.Uri {
		const uri = vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: `/${relativePath}`, query: String(this.counter++) });
		this.contents.set(uri.toString(), content);
		return uri;
	}

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this.contents.get(uri.toString()) ?? '';
	}

	remove(uri: vscode.Uri): void {
		this.contents.delete(uri.toString());
	}
}

const proposedContent = new ProposedContentProvider();

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

type WebviewMessage =
	| { type: 'ready' }
	| { type: 'refreshModels' }
	| { type: 'delegate'; chatModel: string; codeModel: string; task: string; history: ChatMessage[] }
	| { type: 'sendMessage'; model: string; codeModel?: string; prompt: string; history: ChatMessage[] }
	| { type: 'applyCode'; code: string };

class ChatViewProvider implements vscode.WebviewViewProvider {
	private view: vscode.WebviewView | undefined;
	private client: OllamaClient;

	constructor(context: vscode.ExtensionContext) {
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
			enableScripts: true
		};
		webviewView.webview.html = createChatViewHtml();
		const messageSubscription = webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
			void this.handleMessage(message);
		});
		webviewView.onDidDispose(() => {
			messageSubscription.dispose();
			if (this.view === webviewView) {
				this.view = undefined;
			}
		});
	}

	private createClient(): OllamaClient {
		const configuration = vscode.workspace.getConfiguration('localCopilot');
		return new OllamaClient(
			configuration.get<string>('ollamaBaseUrl', 'http://127.0.0.1:11434'),
			configuration.get<number>('requestTimeoutMs', 300000)
		);
	}

	private async handleMessage(message: WebviewMessage): Promise<void> {
		try {
			switch (message.type) {
				case 'ready':
				case 'refreshModels':
					await this.refreshModels();
					break;
				case 'sendMessage': {
					const prompt = message.prompt.trim();
					if (!prompt || !message.model.trim()) {
						throw new Error('Choose a model and enter a message before sending.');
					}
					this.post({ type: 'status', text: 'Thinking…' });
					const configuration = vscode.workspace.getConfiguration('localCopilot');
					const codeModel = message.codeModel?.trim();
					const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
					const canDelegate = configuration.get<boolean>('autoDelegate', true) && Boolean(codeModel) && Boolean(root);
					const result = await chatWithDelegation({
						client: this.client,
						chatModel: message.model.trim(),
						codeModel: codeModel ?? '',
						prompt,
						history: message.history,
						createTools: canDelegate && root ? () => this.createTools(root) : undefined,
						onProgress: text => this.post({ type: 'status', text })
					});
					this.post({ type: 'response', content: result.content, historyAdditions: result.historyAdditions, delegated: result.delegated });
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
					const result = await delegateCodingTask({
						client: this.client,
						chatModel,
						codeModel,
						task,
						history: message.history,
						tools: this.createTools(root),
						onProgress: text => this.post({ type: 'status', text })
					});
					this.post({ type: 'response', content: result.update, historyAdditions: result.historyAdditions, delegated: true });
					break;
				}
				case 'applyCode':
					await this.applyToActiveEditor(message.code);
					break;
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			this.post({ type: 'error', text: detail });
		}
	}

	private createTools(root: string): WorkspaceTools {
		const requireReview = vscode.workspace.getConfiguration('localCopilot').get<boolean>('reviewChanges', true);
		const reviewer = createChangeReviewer({
			reviewWrite: proposal => this.reviewWrite(root, proposal),
			confirmDelete: async relativePath => await vscode.window.showWarningMessage(
				`Allow the code model to delete ${relativePath}?`,
				{ modal: true },
				'Delete'
			) === 'Delete'
		}, requireReview);
		return new WorkspaceTools(root, { ...reviewer, openDocuments: unsavedDocuments });
	}

	private async reviewWrite(root: string, proposal: WriteProposal): Promise<ReviewDecision> {
		const proposedUri = proposedContent.add(proposal.path, proposal.after);
		const placeholderUri = proposal.before === undefined ? proposedContent.add(proposal.path, '') : undefined;
		const originalUri = placeholderUri ?? vscode.Uri.joinPath(vscode.Uri.file(root), proposal.path);
		try {
			await vscode.commands.executeCommand(
				'vscode.diff',
				originalUri,
				proposedUri,
				`${proposal.path} (proposed change)`,
				{ preview: true, preserveFocus: true }
			);
			// Modal so the prompt cannot disappear into the notification center and leave the code model waiting forever.
			const choice = await vscode.window.showInformationMessage(
				`Local Copilot wants to ${proposal.before === undefined ? 'create' : 'modify'} ${proposal.path}.`,
				{ modal: true, detail: 'Review the diff, then choose Keep to write it. Cancel undoes the change.' },
				'Keep',
				'Keep All'
			);
			return choice === 'Keep' ? 'keep' : choice === 'Keep All' ? 'keepAll' : 'undo';
		} finally {
			proposedContent.remove(proposedUri);
			if (placeholderUri) {
				proposedContent.remove(placeholderUri);
			}
		}
	}

	private async refreshModels(): Promise<void> {
		const models = await this.client.listModels();
		this.post({
			type: 'models',
			models: models.map(model => model.name).filter((name): name is string => Boolean(name)),
			defaultModel: vscode.workspace.getConfiguration('localCopilot').get<string>('defaultModel', 'qwen2.5-coder:7b'),
			defaultCodeModel: vscode.workspace.getConfiguration('localCopilot').get<string>('codeModel', 'qwen2.5-coder:14b')
		});
	}

	private async applyToActiveEditor(code: string): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			throw new Error('Open a text editor before applying a response.');
		}

		await replaceEditorText(
			editor.document,
			editor.selection,
			(start, end) => new vscode.Range(start, end),
			(range, text) => editor.edit(editBuilder => editBuilder.replace(range, text)),
			code
		);
		this.post({ type: 'status', text: 'Response applied to the active editor.' });
	}

	private post(message: Record<string, unknown>): void {
		void this.view?.webview.postMessage(message);
	}

}

export function activate(context: vscode.ExtensionContext): void {
	const provider = new ChatViewProvider(context);
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(PROPOSED_SCHEME, proposedContent),
		vscode.window.registerWebviewViewProvider('localCopilot.chat', provider, {
			webviewOptions: { retainContextWhenHidden: true }
		})
	);
}

export function deactivate(): void {}
