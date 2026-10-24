import * as vscode from 'vscode';
import { createChatViewHtml } from './chatViewHtml';
import { replaceEditorText } from './editorActions';
import { delegateCodingTask } from './orchestrator';
import { ChatMessage, OllamaClient } from './ollamaClient';
import { WorkspaceTools } from './workspaceTools';

type WebviewMessage =
	| { type: 'ready' }
	| { type: 'refreshModels' }
	| { type: 'delegate'; chatModel: string; codeModel: string; task: string; history: ChatMessage[] }
	| { type: 'sendMessage'; model: string; prompt: string; history: ChatMessage[] }
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
					const response = await this.client.chat(message.model.trim(), prompt, message.history);
					this.post({ type: 'response', content: response });
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
					const tools = new WorkspaceTools(root, {
						confirmDelete: async relativePath => await vscode.window.showWarningMessage(
							`Allow the code model to delete ${relativePath}?`,
							{ modal: true },
							'Delete'
						) === 'Delete'
					});
					const result = await delegateCodingTask({
						client: this.client,
						chatModel,
						codeModel,
						task,
						history: message.history,
						tools,
						onProgress: text => this.post({ type: 'status', text })
					});
					this.post({ type: 'response', content: result.update, historyAdditions: result.historyAdditions });
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
		vscode.window.registerWebviewViewProvider('localCopilot.chat', provider)
	);
}

export function deactivate(): void {}
