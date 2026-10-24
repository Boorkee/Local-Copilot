export function createChatViewHtml(): string {
	const nonce = getNonce();
	const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<title>Local Copilot</title>
	<style>
		:root { color-scheme: light dark; }
		body { padding: 0 12px 12px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
		.row { display: flex; gap: 6px; margin: 10px 0; }
		select, textarea { box-sizing: border-box; width: 100%; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 6px; }
		button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 6px 10px; cursor: pointer; }
		button:hover { background: var(--vscode-button-hoverBackground); }
		#messages { display: flex; flex-direction: column; gap: 10px; max-height: 45vh; overflow-y: auto; }
		.message { white-space: pre-wrap; overflow-wrap: anywhere; padding: 8px; background: var(--vscode-editor-inactiveSelectionBackground); }
		.role { font-weight: 600; margin-bottom: 4px; }
		#status { min-height: 1.4em; color: var(--vscode-descriptionForeground); }
		#error { color: var(--vscode-errorForeground); white-space: pre-wrap; }
		textarea { resize: vertical; min-height: 80px; }
	</style>
</head>
<body>
	<div class="row">
		<select id="model" aria-label="Chat model" title="Chat model"></select>
		<button id="refresh" type="button" title="Refresh models">↻</button>
	</div>
	<div class="row">
		<select id="codeModel" aria-label="Code model (used by /code)" title="Code model (used by /code)"></select>
	</div>
	<div id="messages" aria-live="polite"></div>
	<div id="status" role="status"></div>
	<div id="error" role="alert"></div>
	<textarea id="prompt" placeholder="Ask Local Copilot…" aria-label="Message"></textarea>
	<div class="row">
		<button id="send" type="button">Send</button>
		<button id="apply" type="button" disabled>Apply to active editor</button>
	</div>
	<p>Apply replaces the selection, or the whole document if nothing is selected. Start a message with <code>/code</code> to hand a task to the code model, which can read, write, and delete workspace files.</p>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const modelSelect = document.getElementById('model');
		const codeModelSelect = document.getElementById('codeModel');
		const promptInput = document.getElementById('prompt');
		const messagesElement = document.getElementById('messages');
		const statusElement = document.getElementById('status');
		const errorElement = document.getElementById('error');
		const applyButton = document.getElementById('apply');
		const sendButton = document.getElementById('send');
		const history = [];
		let latestResponse = '';
		let pendingPrompt;

		function addMessage(role, content) {
			const message = document.createElement('div');
			message.className = 'message';
			const label = document.createElement('div');
			label.className = 'role';
			label.textContent = role === 'assistant' ? 'Local Copilot' : 'You';
			const text = document.createElement('div');
			text.textContent = content;
			message.append(label, text);
			messagesElement.append(message);
			messagesElement.scrollTop = messagesElement.scrollHeight;
		}

		function fillModelSelect(select, models, defaultModel) {
			const selected = select.value || defaultModel;
			select.replaceChildren();
			for (const name of models) {
				const option = document.createElement('option');
				option.value = name;
				option.textContent = name;
				select.append(option);
			}
			if (!models.includes(defaultModel)) {
				const option = document.createElement('option');
				option.value = defaultModel;
				option.textContent = defaultModel + ' (configured)';
				select.append(option);
			}
			select.value = models.includes(selected) || selected === defaultModel ? selected : defaultModel;
		}

		function sendMessage() {
			const prompt = promptInput.value.trim();
			if (!prompt || sendButton.disabled) return;
			errorElement.textContent = '';
			sendButton.disabled = true;
			addMessage('user', prompt);
			const delegation = prompt.startsWith('/code') && (prompt.length === 5 || prompt[5].trim() === '');
			if (delegation) {
				statusElement.textContent = 'Delegating to the code model…';
				vscode.postMessage({
					type: 'delegate',
					chatModel: modelSelect.value,
					codeModel: codeModelSelect.value,
					task: prompt.slice(5).trim(),
					history: [...history]
				});
			} else {
				statusElement.textContent = 'Sending…';
				vscode.postMessage({ type: 'sendMessage', model: modelSelect.value, prompt, history: [...history] });
			}
			pendingPrompt = prompt;
			promptInput.value = '';
		}

		document.getElementById('send').addEventListener('click', sendMessage);
		document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refreshModels' }));
		document.getElementById('apply').addEventListener('click', () => {
			vscode.postMessage({ type: 'applyCode', code: latestResponse });
		});
		promptInput.addEventListener('keydown', event => {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				sendMessage();
			}
		});
		window.addEventListener('message', event => {
			const message = event.data;
			if (message.type === 'models') {
				fillModelSelect(modelSelect, message.models, message.defaultModel);
				fillModelSelect(codeModelSelect, message.models, message.defaultCodeModel);
				statusElement.textContent = message.models.length ? '' : 'No models found; pull one with Ollama first.';
			} else if (message.type === 'status') {
				statusElement.textContent = message.text;
				errorElement.textContent = '';
			} else if (message.type === 'error') {
				statusElement.textContent = '';
				errorElement.textContent = message.text;
				sendButton.disabled = false;
				pendingPrompt = undefined;
			} else if (message.type === 'response') {
				if (message.historyAdditions) {
					history.push(...message.historyAdditions);
				} else {
					latestResponse = message.content;
					history.push({ role: 'user', content: pendingPrompt }, { role: 'assistant', content: message.content });
					applyButton.disabled = false;
				}
				pendingPrompt = undefined;
				addMessage('assistant', message.content);
				sendButton.disabled = false;
				statusElement.textContent = '';
			}
		});
		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
}

function getNonce(): string {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index++) {
		nonce += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return nonce;
}
