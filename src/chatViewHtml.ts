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
		:root { color-scheme: light dark; --small: calc(var(--vscode-font-size) * 0.85); --base: calc(var(--vscode-font-size) * 0.92); }
		html, body { height: 100%; }
		body { box-sizing: border-box; display: flex; flex-direction: column; min-width: 0; margin: 0; padding: 0; overflow: hidden; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: var(--base); line-height: 1.5; }
		svg { width: 14px; height: 14px; fill: currentColor; stroke: none; flex: none; }
		#messages { display: flex; flex-direction: column; gap: 14px; flex: 1 1 auto; min-height: 60px; overflow-y: auto; padding: 10px 12px; }
		.message.user { align-self: stretch; padding: 6px 10px; border: 1px solid var(--vscode-chat-requestBorder, var(--vscode-widget-border, transparent)); border-radius: 6px; background: var(--vscode-chat-requestBackground, var(--vscode-editor-inactiveSelectionBackground)); }
		.message .head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-weight: 600; }
		.avatar { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
		.avatar svg { width: 12px; height: 12px; }
		.para { white-space: pre-wrap; overflow-wrap: anywhere; }
		.para + .para, .para + .codeblock, .codeblock + .para, .codeblock + .codeblock { margin-top: 6px; }
		code { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.95em; }
		.para code { padding: 0 3px; border-radius: 3px; background: var(--vscode-textCodeBlock-background); }
		.codeblock { border: 1px solid var(--vscode-widget-border, transparent); border-radius: 4px; background: var(--vscode-textCodeBlock-background); overflow: hidden; }
		.codehead { display: flex; align-items: center; gap: 4px; padding: 1px 4px 1px 8px; color: var(--vscode-descriptionForeground); font-size: var(--small); }
		.codehead .lang { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.codeblock pre { margin: 0; padding: 6px 8px; overflow-x: auto; font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 12px); line-height: 1.4; }
		.changes { margin-top: 6px; padding: 4px 8px; border-left: 2px solid var(--vscode-textLink-foreground); color: var(--vscode-descriptionForeground); font-size: var(--small); }
		.changes div { overflow-wrap: anywhere; }
		.thinking { color: var(--vscode-descriptionForeground); font-style: italic; }
		.empty { margin: auto; padding: 0 12px; text-align: center; color: var(--vscode-descriptionForeground); }
		.empty svg { width: 28px; height: 28px; margin-bottom: 6px; }
		.empty .title { color: var(--vscode-foreground); font-size: calc(var(--base) * 1.2); font-weight: 600; }
		.empty p { margin: 6px 0 0; font-size: var(--small); }
		#status { flex: none; padding: 0 12px; color: var(--vscode-descriptionForeground); font-size: var(--small); }
		#error { flex: none; padding: 0 12px; color: var(--vscode-errorForeground); font-size: var(--small); white-space: pre-wrap; overflow-wrap: anywhere; }
		#status:not(:empty), #error:not(:empty) { margin-bottom: 4px; }
		.composer { flex: none; margin: 4px 12px 12px; border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, transparent)); border-radius: 6px; background: var(--vscode-input-background); }
		.composer:focus-within { border-color: var(--vscode-focusBorder); }
		textarea { box-sizing: border-box; display: block; width: 100%; height: 38px; min-height: 38px; max-height: 180px; padding: 8px 10px 4px; resize: none; border: 0; outline: 0; color: var(--vscode-input-foreground); background: transparent; font: inherit; }
		textarea::placeholder { color: var(--vscode-input-placeholderForeground); }
		.toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 4px; padding: 2px 4px 4px 6px; }
		.pick { position: relative; display: inline-flex; align-items: center; min-width: 0; max-width: 100%; color: var(--vscode-descriptionForeground); font-size: var(--small); }
		.pick::after { content: '▾'; position: absolute; right: 3px; font-size: 9px; pointer-events: none; }
		.pick span { margin-right: 2px; }
		select { appearance: none; -webkit-appearance: none; min-width: 0; max-width: 130px; padding: 1px 13px 1px 3px; border: 1px solid transparent; border-radius: 3px; color: var(--vscode-foreground); background: transparent; font: inherit; font-size: var(--small); text-overflow: ellipsis; cursor: pointer; }
		select:hover { background: var(--vscode-toolbar-hoverBackground); }
		select option { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); }
		.spacer { flex: 1 1 0; }
		button { display: inline-flex; align-items: center; justify-content: center; font: inherit; cursor: pointer; }
		button.icon { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 4px; color: var(--vscode-icon-foreground); background: transparent; }
		button.icon:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); }
		button.send { width: 24px; height: 22px; padding: 0; border: 0; border-radius: 4px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
		button.send:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
		button.link { padding: 0 4px; border: 0; border-radius: 3px; color: var(--vscode-textLink-foreground); background: transparent; font-size: var(--small); }
		button.link:hover { background: var(--vscode-toolbar-hoverBackground); }
		select:focus-visible, button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
		button:disabled { opacity: 0.5; cursor: default; }
	</style>
</head>
<body>
	<div id="messages" aria-live="polite"></div>
	<div id="status" role="status"></div>
	<div id="error" role="alert"></div>
	<div class="composer">
		<textarea id="prompt" rows="1" placeholder="Ask Local Copilot, or start with /code for a coding task" aria-label="Message"></textarea>
		<div class="toolbar">
			<label class="pick" title="Chat model"><span>Chat</span><select id="model" aria-label="Chat model"></select></label>
			<label class="pick" title="Code model (used by /code and automatic delegation)"><span>Code</span><select id="codeModel" aria-label="Code model"></select></label>
			<button id="refresh" class="icon" type="button" title="Refresh models" aria-label="Refresh models"><svg viewBox="0 0 16 16"><path d="M8 3a5 5 0 1 0 4.9 6h-1.5A3.5 3.5 0 1 1 8 4.5c.9 0 1.7.4 2.3 1L8.5 7.3H13V2.8l-1.7 1.7A5 5 0 0 0 8 3z"/></svg></button>
			<span class="spacer"></span>
			<button id="send" class="send" type="button" title="Send (Enter)" aria-label="Send"><svg viewBox="0 0 16 16"><path d="M1.5 1.8l13 6.2-13 6.2 2.2-6.2z"/></svg></button>
		</div>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const modelSelect = document.getElementById('model');
		const codeModelSelect = document.getElementById('codeModel');
		const promptInput = document.getElementById('prompt');
		const messagesElement = document.getElementById('messages');
		const statusElement = document.getElementById('status');
		const errorElement = document.getElementById('error');
		const sendButton = document.getElementById('send');
		const TICK = String.fromCharCode(96);
		const FENCE = TICK + TICK + TICK;
		const NEWLINE = String.fromCharCode(10);
		const SPARKLE = 'M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z';
		const savedState = vscode.getState() || {};
		let chat;
		let busy = false;
		let pending;
		let pendingElement;

		function sparkle() {
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('viewBox', '0 0 16 16');
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', SPARKLE);
			svg.append(path);
			return svg;
		}

		function appendInline(parent, text) {
			let index = 0;
			while (index < text.length) {
				const tick = text.indexOf(TICK, index);
				const bold = text.indexOf('**', index);
				const isCode = tick !== -1 && (bold === -1 || tick < bold);
				const start = isCode ? tick : bold;
				if (start === -1) { parent.append(text.slice(index)); return; }
				const marker = isCode ? TICK : '**';
				const end = text.indexOf(marker, start + marker.length);
				if (end === -1) { parent.append(text.slice(index)); return; }
				if (start > index) parent.append(text.slice(index, start));
				const node = document.createElement(isCode ? 'code' : 'strong');
				node.textContent = text.slice(start + marker.length, end);
				parent.append(node);
				index = end + marker.length;
			}
		}

		function trimNewlines(text) {
			let start = 0;
			let end = text.length;
			while (start < end && text[start] === NEWLINE) start++;
			while (end > start && text[end - 1] === NEWLINE) end--;
			return text.slice(start, end);
		}

		function addText(container, text) {
			const trimmed = trimNewlines(text);
			if (!trimmed) return;
			const paragraph = document.createElement('div');
			paragraph.className = 'para';
			appendInline(paragraph, trimmed);
			container.append(paragraph);
		}

		function addCodeBlock(container, language, code) {
			const block = document.createElement('div');
			block.className = 'codeblock';
			const head = document.createElement('div');
			head.className = 'codehead';
			const lang = document.createElement('span');
			lang.className = 'lang';
			lang.textContent = language;
			const copy = document.createElement('button');
			copy.type = 'button';
			copy.className = 'link';
			copy.textContent = 'Copy';
			copy.addEventListener('click', () => vscode.postMessage({ type: 'copyCode', code }));
			const apply = document.createElement('button');
			apply.type = 'button';
			apply.className = 'link';
			apply.textContent = 'Apply';
			apply.title = 'Replace the selection (or whole file) in the active editor';
			apply.addEventListener('click', () => vscode.postMessage({ type: 'applyCode', code }));
			head.append(lang, copy, apply);
			const pre = document.createElement('pre');
			const body = document.createElement('code');
			body.textContent = code;
			pre.append(body);
			block.append(head, pre);
			container.append(block);
		}

		function renderMarkdown(container, text) {
			let index = 0;
			while (index < text.length) {
				const open = text.indexOf(FENCE, index);
				if (open === -1) { addText(container, text.slice(index)); return; }
				addText(container, text.slice(index, open));
				const lineEnd = text.indexOf(NEWLINE, open);
				if (lineEnd === -1) { addText(container, text.slice(open)); return; }
				const language = text.slice(open + 3, lineEnd).trim();
				const close = text.indexOf(NEWLINE + FENCE, lineEnd);
				const code = close === -1 ? text.slice(lineEnd + 1) : text.slice(lineEnd + 1, close);
				addCodeBlock(container, language, code);
				index = close === -1 ? text.length : close + 4;
			}
		}

		function addMessage(role, content, changes, isPending) {
			const message = document.createElement('div');
			message.className = 'message ' + role;
			if (role === 'assistant') {
				const head = document.createElement('div');
				head.className = 'head';
				const avatar = document.createElement('span');
				avatar.className = 'avatar';
				avatar.append(sparkle());
				const name = document.createElement('span');
				name.textContent = 'Local Copilot';
				head.append(avatar, name);
				message.append(head);
			}
			const text = document.createElement('div');
			if (isPending) {
				text.className = 'thinking';
				text.textContent = statusElement.textContent || 'Working…';
				pendingElement = text;
			} else if (role === 'assistant') {
				renderMarkdown(text, content);
			} else {
				text.className = 'para';
				text.textContent = content;
			}
			message.append(text);
			if (changes && changes.length) {
				const list = document.createElement('div');
				list.className = 'changes';
				for (const change of changes) {
					const row = document.createElement('div');
					row.textContent = (change.action === 'delete' ? 'Deleted ' : 'Changed ') + change.path;
					list.append(row);
				}
				message.append(list);
			}
			messagesElement.append(message);
		}

		function addEmptyState() {
			const empty = document.createElement('div');
			empty.className = 'empty';
			const title = document.createElement('div');
			title.className = 'title';
			title.textContent = 'Local Copilot';
			const hint = document.createElement('p');
			hint.textContent = 'Chat with a local Ollama model. Coding tasks are handed to the code model automatically, or start a message with /code.';
			empty.append(sparkle(), title, hint);
			messagesElement.append(empty);
		}

		function render() {
			messagesElement.replaceChildren();
			pendingElement = undefined;
			const entries = chat ? chat.transcript : [];
			if (!entries.length && !pending) addEmptyState();
			for (const entry of entries) addMessage(entry.role, entry.content, entry.changes, false);
			if (pending) {
				addMessage('user', pending.prompt, undefined, false);
				addMessage('assistant', '', undefined, true);
			}
			sendButton.disabled = busy;
			messagesElement.scrollTop = messagesElement.scrollHeight;
		}

		function setStatus(text) {
			statusElement.textContent = text;
			if (pendingElement && text) pendingElement.textContent = text;
		}

		function fillModelSelect(select, models, defaultModel, remembered) {
			const selected = select.value || remembered || defaultModel;
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

		function rememberModels() {
			vscode.setState({ model: modelSelect.value, codeModel: codeModelSelect.value });
		}

		function autosize() {
			promptInput.style.height = 'auto';
			promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
		}

		function sendMessage() {
			const prompt = promptInput.value.trim();
			if (!prompt || busy) return;
			errorElement.textContent = '';
			busy = true;
			pending = { prompt };
			const delegation = prompt.startsWith('/code') && (prompt.length === 5 || prompt[5].trim() === '');
			if (delegation) {
				vscode.postMessage({
					type: 'delegate',
					chatModel: modelSelect.value,
					codeModel: codeModelSelect.value,
					task: prompt.slice(5).trim(),
					prompt
				});
			} else {
				vscode.postMessage({ type: 'sendMessage', model: modelSelect.value, codeModel: codeModelSelect.value, prompt });
			}
			promptInput.value = '';
			autosize();
			render();
		}

		sendButton.addEventListener('click', sendMessage);
		document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refreshModels' }));
		modelSelect.addEventListener('change', rememberModels);
		codeModelSelect.addEventListener('change', rememberModels);
		promptInput.addEventListener('input', autosize);
		promptInput.addEventListener('keydown', event => {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				sendMessage();
			}
		});
		window.addEventListener('message', event => {
			const message = event.data;
			if (message.type === 'models') {
				fillModelSelect(modelSelect, message.models, message.defaultModel, savedState.model);
				fillModelSelect(codeModelSelect, message.models, message.defaultCodeModel, savedState.codeModel);
				rememberModels();
				if (!message.models.length) setStatus('No models found; pull one with Ollama first.');
			} else if (message.type === 'state') {
				chat = message.chat;
				busy = Boolean(message.busy);
				pending = message.pending;
				errorElement.textContent = '';
				setStatus(busy ? message.status || '' : '');
				render();
			} else if (message.type === 'status') {
				setStatus(message.text);
				errorElement.textContent = '';
			} else if (message.type === 'error') {
				busy = false;
				pending = undefined;
				setStatus('');
				errorElement.textContent = message.text;
				if (message.prompt && !promptInput.value) {
					promptInput.value = message.prompt;
					autosize();
				}
				render();
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
