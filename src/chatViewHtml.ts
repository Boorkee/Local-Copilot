export function createChatViewHtml(effectsUri?: string): string {
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
		button svg, .avatar svg, .empty > svg { width: 14px; height: 14px; fill: currentColor; stroke: none; flex: none; }
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
		[hidden] { display:none !important; }
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

        .brand { display:flex; align-items:center; gap:10px; padding:18px 16px; border-bottom:1px solid var(--vscode-widget-border, transparent); flex:none; }
        .brand-mark { display:grid; place-items:center; width:32px; height:32px; border:1px solid var(--vscode-focusBorder); border-radius:10px; color:var(--vscode-textLink-foreground); font-weight:700; letter-spacing:-1px; }
        .brand strong { display:block; font-size:13px; letter-spacing:0.2px; }
        .brand div > span { display:block; margin-top:3px; font-size:8px; letter-spacing:1.6px; color:var(--vscode-descriptionForeground); }
        .local-badge { margin-left:auto; padding:3px 6px; border:1px solid var(--vscode-widget-border, transparent); border-radius:5px; font-size:8px; letter-spacing:1px; color:var(--vscode-descriptionForeground); }
        #messages { padding:22px 16px; gap:22px; }
        .message.user { padding:12px 14px; border-radius:12px; }
        .message .head { margin-bottom:9px; gap:8px; }
        .empty { margin:clamp(16px, 8vh, 90px) 0 auto; padding:12px 0; max-width:340px; text-align:left; }
        .empty > svg { width:32px; height:32px; color:var(--vscode-textLink-foreground); margin-bottom:18px; }
        .empty .title { font-size:20px; letter-spacing:-0.5px; }
        .empty p { font-size:12px; line-height:1.7; margin-top:9px; }
        .suggestions { display:flex; flex-direction:column; gap:8px; margin-top:24px; }
        .suggestions button { text-align:left; justify-content:flex-start; padding:10px 12px; border:1px solid var(--vscode-widget-border, var(--vscode-input-border, transparent)); border-radius:8px; background:var(--vscode-input-background); color:var(--vscode-foreground); font-size:11px; }
        .suggestions button:hover { border-color:var(--vscode-focusBorder); }
        #effects { flex:0 1 auto; min-height:0; max-height:75%; overflow-y:auto; overflow-x:hidden; padding:6px 14px 14px; }
        .activity { display:flex; align-items:center; gap:8px; min-height:28px; margin:0 4px 8px; color:var(--vscode-descriptionForeground); font-size:11px; }
        .activity span:last-child { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
        .ready-dot { width:6px; height:6px; border-radius:50%; background:var(--vscode-textLink-foreground); }
        .mode-row { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
        .mode-switch { position:relative; display:flex; padding:3px; border-radius:20px; background:var(--vscode-input-background); border:1px solid var(--vscode-widget-border, transparent); }
        .mode-liquid { position:absolute !important; inset:3px; pointer-events:none; }
        .mode-blob { width:76px; height:28px; border-radius:16px; transition:transform 260ms cubic-bezier(.2,.8,.2,1); }
        button.mode { position:relative; z-index:1; width:76px; height:28px; border:0; border-radius:16px; background:transparent; color:var(--vscode-descriptionForeground); font-size:11px; }
        button.mode[aria-pressed="true"] { color:var(--vscode-button-foreground); }
        button.mode.plain[aria-pressed="true"] { background:var(--vscode-button-background); }
        .mode-caption { margin-left:auto; color:var(--vscode-descriptionForeground); font-size:9px; text-align:right; }
        .composer-beam, .composer-voice, .composer-slot { display:block; width:100%; min-width:0; border-radius:12px; }
        .composer-slot .composer { margin:0; border-radius:12px; overflow:hidden; }
        textarea { min-height:72px; padding:14px 12px 8px; line-height:1.6; }
        .toolbar { gap:6px; padding:8px; border-top:1px solid var(--vscode-widget-border, transparent); }
		.pick { flex:1 1 90px; }
		select { width:100%; max-width:175px; }
		.route-hint { padding:0 10px 8px; color:var(--vscode-descriptionForeground); font-size:10px; line-height:1.35; }
		.route-hint:empty { display:none; }
		.model-pill { display:inline-flex; align-items:center; gap:5px; min-width:0; max-width:100%; padding:3px 8px; border:1px solid var(--vscode-widget-border, transparent); border-radius:20px; background:var(--vscode-input-background); color:var(--vscode-descriptionForeground); font-size:10px; font-weight:400; white-space:nowrap; }
		.model-pill strong { font-weight:600; color:var(--vscode-foreground); }
		.model-pill .model-name { display:inline-block; min-width:0; max-width:150px; overflow:hidden; text-overflow:ellipsis; }
		.model-pill .model-dot { width:5px; height:5px; flex:none; border-radius:50%; background:var(--vscode-textLink-foreground); }
		.model-pill { animation: model-appear 180ms ease-out both; }
		@keyframes model-appear { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
		.message .head { flex-wrap:wrap; }
        button.send { width:30px; height:28px; border-radius:8px; }
        button.icon { width:28px; height:28px; }
        .voice-panel { padding:12px; margin-bottom:12px; border:1px solid var(--vscode-widget-border, transparent); border-radius:10px; background:var(--vscode-input-background); }
        .voice-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; font-weight:600; }
        .record { border:1px solid var(--vscode-focusBorder); border-radius:6px; padding:5px 8px; background:transparent; color:var(--vscode-textLink-foreground); font-size:11px; }
        .voice-panel p { font-size:11px; color:var(--vscode-descriptionForeground); margin:8px 0 0; }
        button:focus-visible, select:focus-visible { outline:2px solid var(--vscode-focusBorder); outline-offset:2px; }
        @media (max-width:280px) { .mode-caption, .local-badge { display:none; } .brand { padding:12px; } }
        @media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; } }

        #status { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); padding:0; }
        .activity .record { margin-left:auto; white-space:nowrap; }
        .connection-panel, .review-panel { margin:0 0 12px; padding:12px; border:1px solid var(--vscode-widget-border, transparent); border-radius:10px; background:var(--vscode-input-background); }
        .connection-panel p, .review-panel p { font-size:11px; overflow-wrap:anywhere; color:var(--vscode-descriptionForeground); white-space:pre-wrap; }
        .connection-panel button { margin:3px 6px 0 0; }
        .review-title, .review-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .review-title { flex-wrap:wrap; }
        .review-path { white-space:pre-wrap; overflow-wrap:anywhere; font-size:11px; font-family:var(--vscode-editor-font-family, monospace); }
        .inline-diff { max-height:200px; overflow:auto; margin:10px 0; font-size:11px; font-family:var(--vscode-editor-font-family, monospace); }
        .inline-diff > div { white-space:pre; min-width:max-content; padding:2px 4px; }
        .inline-diff span { display:inline-block; width:16px; }
        .added, .diff-add { color:var(--vscode-gitDecoration-addedResourceForeground, green); }
        .removed, .diff-remove { color:var(--vscode-gitDecoration-deletedResourceForeground, red); }
        .diff-add { background:var(--vscode-diffEditor-insertedTextBackground); }
        .diff-remove { background:var(--vscode-diffEditor-removedTextBackground); }
	        .review-actions { justify-content:flex-end; flex-wrap:wrap; }
        .approve { border:0; border-radius:6px; padding:6px 12px; color:var(--vscode-button-foreground); background:var(--vscode-button-background); }
        .review-note { margin-bottom:0; }
        .command-output { margin-bottom:12px; color:var(--vscode-descriptionForeground); font-size:11px; }
        .command-output pre { max-height:140px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; }
	        .task-steps { margin-top:10px; border:1px solid var(--vscode-widget-border, transparent); border-radius:8px; padding:6px 9px; color:var(--vscode-descriptionForeground); font-size:var(--small); }
	        .attachment-chips, .attached-source { display:flex; flex-wrap:wrap; gap:5px; margin:4px 8px; }
	        .attachment-chips:empty, .attached-source:empty { display:none; }
	        .attachment-chips button, .attached-source span { border:1px solid var(--vscode-widget-border, transparent); border-radius:12px; padding:3px 7px; color:var(--vscode-descriptionForeground); background:var(--vscode-input-background); font-size:var(--small); max-width:100%; overflow-wrap:anywhere; }
	        .task-steps summary { cursor:pointer; }
	        .task-steps ol { padding:0 0 0 16px; margin:8px 0 0; }
	        .task-steps li { display:flex; justify-content:space-between; gap:8px; margin:4px 0; overflow-wrap:anywhere; }
	        .step-failed { color:var(--vscode-errorForeground); }
	        .step-done span:last-child { color:var(--vscode-gitDecoration-addedResourceForeground, var(--vscode-foreground)); }
	        .markdown { overflow-wrap:anywhere; min-width:0; }
	        .markdown p { margin:0 0 9px; white-space:pre-wrap; }
	        .markdown p:last-child { margin-bottom:0; }
	        .markdown h1, .markdown h2, .markdown h3, .markdown h4 { margin:14px 0 8px; line-height:1.3; }
	        .markdown h1 { font-size:1.25em; } .markdown h2 { font-size:1.16em; } .markdown h3 { font-size:1.08em; }
	        .markdown ul, .markdown ol { padding-left:20px; margin:8px 0; }
	        .markdown li { margin:3px 0; }
	        .markdown li p { margin:0; }
	        .markdown blockquote { margin:9px 0; padding-left:10px; border-left:2px solid var(--vscode-textLink-foreground); color:var(--vscode-descriptionForeground); }
	        .markdown table { display:block; max-width:100%; overflow-x:auto; border-collapse:collapse; margin:10px 0; font-size:var(--small); }
	        .markdown th, .markdown td { border:1px solid var(--vscode-widget-border, var(--vscode-foreground)); padding:5px 8px; text-align:left; }
	        .markdown a { color:var(--vscode-textLink-foreground); text-decoration:underline; cursor:pointer; }
	        .markdown a:focus-visible { outline:2px solid var(--vscode-focusBorder); }
	        .markdown :not(pre) > code { background:var(--vscode-textCodeBlock-background); border-radius:3px; padding:1px 3px; }
	        .markdown .codeblock { margin:10px 0; }
	        @media (forced-colors:active) { .task-steps, .codeblock, .message.user { border:1px solid CanvasText; } }
	</style>
</head>
<body>
	<header class="brand"><span class="brand-mark">LC</span><div><strong>Local Copilot</strong><span>THINK · BUILD · ITERATE</span></div><span class="local-badge">OLLAMA</span></header>
	<div id="messages" aria-live="polite"></div>
	<div id="status" role="status"></div>
	<div id="error" role="alert"></div>
	<div class="composer">
		<textarea id="prompt" rows="1" placeholder="Ask Local Copilot to build, fix, or explain…" aria-label="Message"></textarea>
			<div id="attachment-chips" class="attachment-chips" aria-label="Attached context"></div>
		<div class="toolbar">
	            <label class="pick" title="Agent edits with approval; Plan reads only; Chat answers questions"><select id="agentMode" aria-label="Assistant mode"><option value="agent">Agent</option><option value="plan">Plan</option><option value="chat">Chat</option></select></label>
			<label class="pick" id="chat-model-picker" title="Choose a model for Chat mode"><span>Model</span><select id="model" aria-label="Chat model"></select></label>
			<label class="pick" id="code-model-picker" title="Choose a model for Agent and Plan modes"><span>Model</span><select id="codeModel" aria-label="Agent model"></select></label>
			<button id="refresh" class="icon" type="button" title="Refresh models" aria-label="Refresh models"><svg viewBox="0 0 16 16"><path d="M8 3a5 5 0 1 0 4.9 6h-1.5A3.5 3.5 0 1 1 8 4.5c.9 0 1.7.4 2.3 1L8.5 7.3H13V2.8l-1.7 1.7A5 5 0 0 0 8 3z"/></svg></button>
				<button id="attach" class="icon" type="button" title="Attach active editor or selection" aria-label="Attach active editor"><svg viewBox="0 0 16 16"><path d="M6.5 13.5a3.5 3.5 0 0 1-3.5-3.5V5.5a2.5 2.5 0 0 1 5 0v4.7a1.5 1.5 0 0 1-3 0V6.5h1.3v3.7a.2.2 0 0 0 .4 0V5.5a1.2 1.2 0 0 0-2.4 0V10a2.2 2.2 0 0 0 4.4 0V5a3.5 3.5 0 1 1 7 0v5.2h-1.3V5a2.2 2.2 0 0 0-4.4 0v5a3.5 3.5 0 0 1-3.5 3.5z"/></svg></button>
			<span class="spacer"></span>
			<button id="send" class="send" type="button" title="Send (Enter)" aria-label="Send"><svg viewBox="0 0 16 16"><path d="M1.5 1.8l13 6.2-13 6.2 2.2-6.2z"/></svg></button>
		</div>
		<div class="route-hint" id="routeHint" aria-live="polite"></div>
	</div>
	<div id="effects"></div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		window.copilot = { post: message => vscode.postMessage(message), busy: false, recording: false, status: '', connection: 'loading', connectionError: '', review: null, commandOutput: '' };
		function updateEffects() {
			window.copilot.busy = busy;
			window.copilot.status = statusElement.textContent;
			window.dispatchEvent(new Event('copilot-state'));
		}
		const modelSelect = document.getElementById('model');
		const codeModelSelect = document.getElementById('codeModel');
		const agentModeSelect = document.getElementById('agentMode');
		const routeHint = document.getElementById('routeHint');
		const promptInput = document.getElementById('prompt');
		const statusElement = document.getElementById('status');
		const errorElement = document.getElementById('error');
		const sendButton = document.getElementById('send');
			const attachmentsElement = document.getElementById('attachment-chips');
		const savedState = vscode.getState() || {};
		let busy = false;

		function render() {
			// The message feed is rendered by React; this only updates composer controls.
			sendButton.disabled = window.copilot.connection !== 'ready' || Boolean(window.copilot.review) || busy || window.copilot.recording || !promptInput.value.trim();
			const chatting = agentModeSelect.value === 'chat';
			document.getElementById('chat-model-picker').hidden = !chatting;
			document.getElementById('code-model-picker').hidden = chatting;
			const chosen = chatting ? modelSelect.value : codeModelSelect.value;
			const tier = chosen === 'auto:fast' ? 'Fast' : chosen === 'auto:quality' ? 'Quality' : 'Balanced';
			routeHint.textContent = chosen.startsWith('auto:')
				? '✦ Auto · ' + tier + ' — selects an installed local model for each request.'
				: chosen ? 'Using ' + chosen + ' for ' + (chatting ? 'chat' : agentModeSelect.value) + '.' : '';
			modelSelect.disabled = busy;
			codeModelSelect.disabled = busy;
			agentModeSelect.disabled = busy;
			document.getElementById('attach').disabled = busy;
			updateEffects();
		}

		function setStatus(text) {
			statusElement.textContent = text;
			updateEffects();
		}

		function fillModelSelect(select, models, defaultModel, remembered, capabilities = {}, requiresTools = false) {
			const selected = select.value || remembered || defaultModel;
			select.replaceChildren();
			const automatic = document.createElement('optgroup');
			automatic.label = 'Automatic routing';
			const tiers = [['auto:balanced', '✦ Auto · Balanced'], ['auto:fast', '⚡ Auto · Fast'], ['auto:quality', '◆ Auto · Quality']];
			for (const [name, label] of tiers) {
				const option = document.createElement('option');
				option.value = name;
				option.textContent = label;
				automatic.append(option);
			}
			select.append(automatic);
			const manual = document.createElement('optgroup');
			manual.label = 'Installed models';
			for (const name of models) {
				const option = document.createElement('option');
				option.value = name;
				option.textContent = name + (capabilities[name] === 'tools' ? ' · tools' : capabilities[name] === 'chat' ? ' · chat only' : capabilities[name] === 'unsupported' ? ' · not chat-capable' : '');
				option.disabled = capabilities[name] === 'unsupported' || requiresTools && capabilities[name] === 'chat';
				manual.append(option);
			}
			select.append(manual);
			const available = models.filter(name => capabilities[name] !== 'unsupported' && (!requiresTools || capabilities[name] !== 'chat'));
			const valid = value => tiers.some(([name]) => value === name) || available.includes(value);
			select.value = valid(selected) ? selected : valid(defaultModel) ? defaultModel : 'auto:balanced';
			select.title = requiresTools ? 'Auto selects verified tool-capable models; manual models require tool support' : 'Auto selects a local model for each request';
		}

		function rememberModels() {
			vscode.setState({ ...vscode.getState(), model: modelSelect.value, codeModel: codeModelSelect.value });
		}

		function autosize() {
			promptInput.style.height = 'auto';
			promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
		}

		function sendMessage() {
			const prompt = promptInput.value.trim();
			if (!prompt || busy) return;
			if (window.copilot.recording || window.copilot.review || window.copilot.connection !== 'ready') return;
			errorElement.textContent = '';
			busy = true;
			vscode.postMessage({ type: 'sendMessage', model: modelSelect.value, codeModel: codeModelSelect.value, prompt, mode: agentModeSelect.value });
			promptInput.value = '';
			vscode.setState({ ...vscode.getState(), draft: '' });
			autosize();
			render();
		}

		sendButton.addEventListener('click', sendMessage);
		document.getElementById('attach').addEventListener('click', () => vscode.postMessage({ type: 'attachEditor' }));
		document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refreshModels' }));
		modelSelect.addEventListener('change', () => { rememberModels(); render(); });
		codeModelSelect.addEventListener('change', () => { rememberModels(); render(); });
		agentModeSelect.addEventListener('change', () => { vscode.setState({ ...vscode.getState(), mode: agentModeSelect.value }); render(); });
		if (['chat', 'agent', 'plan'].includes(savedState.mode)) agentModeSelect.value = savedState.mode;
		render();
		promptInput.addEventListener('input', () => { autosize(); sendButton.disabled = window.copilot.connection !== 'ready' || Boolean(window.copilot.review) || busy || window.copilot.recording || !promptInput.value.trim(); vscode.setState({ ...vscode.getState(), draft: promptInput.value }); });
		promptInput.value = savedState.draft || '';
		autosize();
		promptInput.addEventListener('keydown', event => {
			if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
				event.preventDefault();
				sendMessage();
			}
		});
		window.addEventListener('message', event => {
			const message = event.data;
			if (message.type === 'attachments') {
				attachmentsElement.replaceChildren();
				for (const item of message.items) {
					const chip = document.createElement('button');
					chip.type = 'button';
					chip.textContent = item.label + ' ×';
					chip.title = 'Remove attachment';
					chip.addEventListener('click', () => vscode.postMessage({ type: 'removeAttachment', id: item.id }));
					attachmentsElement.append(chip);
				}
			} else if (message.type === 'connection') {
                window.copilot.connection = message.state;
                window.copilot.connectionError = message.text || '';
                sendButton.disabled = message.state !== 'ready' || busy || window.copilot.recording || !promptInput.value.trim();
                updateEffects();
            } else if (message.type === 'review') {
                window.copilot.review = message.review;
                updateEffects();
            } else if (message.type === 'commandOutput') {
                window.copilot.commandOutput = ((message.reset ? '' : window.copilot.commandOutput) + message.text).slice(-64000);
                updateEffects();
            } else if (message.type === 'models') {
				fillModelSelect(modelSelect, message.models, message.defaultModel, savedState.model, message.capabilities);
				fillModelSelect(codeModelSelect, message.models, message.defaultCodeModel, savedState.codeModel, message.capabilities, true);
				rememberModels();
				render();
				if (!message.models.length) setStatus('No models found; pull one with Ollama first.');
			} else if (message.type === 'state') {
                window.copilot.review = message.review || null;
                window.copilot.commandOutput = message.commandOutput || '';
				busy = Boolean(message.busy);
				errorElement.textContent = '';
				setStatus(busy ? message.status || '' : '');
				render();
			} else if (message.type === 'status') {
				setStatus(message.text);
				errorElement.textContent = '';
			} else if (message.type === 'error') {
				busy = false;
				setStatus('');
				errorElement.textContent = message.text;
				if (message.prompt && !promptInput.value) {
					promptInput.value = message.prompt;
					autosize();
				}
				render();
			}
		});
		// The effects bundle requests initial state after installing its listeners.
	</script>
	${effectsUri ? `<script nonce="${nonce}" src="${escapeAttribute(effectsUri)}" defer></script>` : ''}
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

function escapeAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
