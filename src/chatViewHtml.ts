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
        #messages > .message { box-sizing:border-box; width:100%; max-width:840px; margin-inline:auto; }
        .message.user { padding:12px 14px; border-radius:12px; }
        .message .head { margin-bottom:9px; gap:8px; }
        .empty { box-sizing:border-box; width:100%; margin:clamp(16px, 8vh, 90px) auto auto; padding:12px 0; max-width:340px; text-align:left; }
        .empty > svg { width:32px; height:32px; color:var(--vscode-textLink-foreground); margin-bottom:18px; }
        .empty .title { font-size:20px; letter-spacing:-0.5px; }
        .empty p { font-size:12px; line-height:1.7; margin-top:9px; }
        .suggestions { display:flex; flex-direction:column; gap:8px; margin-top:24px; }
        .suggestions button { text-align:left; justify-content:flex-start; padding:10px 12px; border:1px solid var(--vscode-widget-border, var(--vscode-input-border, transparent)); border-radius:8px; background:var(--vscode-input-background); color:var(--vscode-foreground); font-size:11px; }
        .suggestions button:hover { border-color:var(--vscode-focusBorder); }
        #effects { box-sizing:border-box; width:100%; max-width:868px; margin-inline:auto; flex:0 1 auto; min-height:0; max-height:75%; overflow-y:auto; overflow-x:hidden; padding:6px 14px 14px; }
        #error { box-sizing:border-box; width:100%; max-width:868px; margin-inline:auto; }
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
		.composer-controls { display:flex; flex:1 1 auto; min-width:0; align-items:center; flex-wrap:wrap; gap:5px; }
		.composer-pick { min-width:0; max-width:100%; padding:5px 9px; gap:7px; justify-content:space-between; border:1px solid transparent; border-radius:9px; background:transparent; color:var(--vscode-foreground); font-size:12px; white-space:nowrap; }
		.composer-pick:hover:not(:disabled), .composer-pick[aria-expanded="true"] { border-color:var(--vscode-widget-border, transparent); background:var(--vscode-toolbar-hoverBackground); }
		.composer-pick .chevron { font-size:9px; color:var(--vscode-descriptionForeground); transition:transform 180ms ease; }
		.composer-pick[aria-expanded="true"] .chevron { transform:rotate(180deg); }
		.composer-pick .pick-value { overflow:hidden; max-width:145px; text-overflow:ellipsis; }
		.composer-pick .pick-label { font-size:10px; color:var(--vscode-descriptionForeground); }
		.composer-pick.primary { border-color:var(--vscode-widget-border, transparent); background:var(--vscode-editor-inactiveSelectionBackground); }
		.composer-pick.routing-auto { color:var(--vscode-textLink-foreground); }
		.composer-pick.model-auto { color:var(--vscode-descriptionForeground); }
		#picker-popover { position:fixed; z-index:100; box-sizing:border-box; width:min(340px, calc(100vw - 16px)); max-height:55vh; display:flex; flex-direction:column; padding:8px; overflow:hidden; border:1px solid var(--vscode-widget-border, var(--vscode-focusBorder)); border-radius:16px; color:var(--vscode-foreground); background:var(--vscode-editorWidget-background, var(--vscode-dropdown-background)); box-shadow:0 12px 32px rgba(0,0,0,.22); opacity:0; transform:translateY(12px) scale(.97); transform-origin:bottom center; visibility:hidden; pointer-events:none; transition:opacity 220ms ease, transform 260ms cubic-bezier(.2,.8,.2,1), visibility 0s linear 260ms; }
		#picker-popover.open { opacity:1; transform:translateY(0) scale(1); visibility:visible; pointer-events:auto; transition-delay:0s; }
		.popover-title { flex:none; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 9px 10px; font-size:13px; font-weight:600; }
		.popover-title span:last-child { font-size:10px; font-weight:400; color:var(--vscode-descriptionForeground); }
		.popover-options { position:relative; min-height:0; overflow-y:auto; overscroll-behavior:contain; border-radius:10px; }
		.popover-option { box-sizing:border-box; display:flex; align-items:flex-start; gap:8px; width:100%; padding:10px 11px; margin:1px 0; text-align:left; border:1px solid transparent; border-radius:10px; background:transparent; color:var(--vscode-foreground); }
		.popover-option:hover:not(:disabled), .popover-option:focus-visible { background:var(--vscode-list-hoverBackground); }
		.popover-option[aria-checked="true"] { background:var(--vscode-list-inactiveSelectionBackground); border-color:var(--vscode-focusBorder); }
		.popover-option .option-copy { flex:1; min-width:0; }
		.popover-option strong { display:block; overflow-wrap:anywhere; font-weight:600; font-size:12px; }
		.popover-option small { display:block; margin-top:3px; color:var(--vscode-descriptionForeground); font-size:11px; line-height:1.5; overflow-wrap:anywhere; }
		.popover-option .check { color:var(--vscode-textLink-foreground); font-size:13px; }
		.popover-option:disabled { opacity:.5; cursor:default; }
		.popover-filter { position:absolute; z-index:1; inset:0; display:grid; place-items:center; padding:12px; text-align:center; border-radius:10px; background:var(--vscode-editorWidget-background, var(--vscode-dropdown-background)); background:color-mix(in srgb, var(--vscode-editorWidget-background, var(--vscode-dropdown-background)) 63%, transparent); backdrop-filter:blur(1.5px); }
		.popover-filter span { padding:9px 12px; border:1px solid var(--vscode-widget-border, var(--vscode-focusBorder)); border-radius:20px; color:var(--vscode-foreground); background:var(--vscode-editorWidget-background, var(--vscode-dropdown-background)); font-size:11px; font-weight:600; }
		.popover-goo { height:8px; flex:none; width:70px; margin:-8px auto 2px; opacity:.8; transform:scaleX(.3); transition:transform 300ms cubic-bezier(.2,.8,.2,1); }
		#picker-popover.open .popover-goo { transform:scaleX(1); }
		.picker-liquid { display:block; width:70px; height:8px; }
		.picker-blob { display:block; width:68px; height:8px; border-radius:50%; background:var(--vscode-textLink-foreground); }
		@media (max-width:440px) { .composer-pick { padding:5px 7px; } .composer-pick .pick-label { display:none; } }
		.route-hint { padding:0 10px 8px; color:var(--vscode-descriptionForeground); font-size:10px; line-height:1.35; }
		.route-hint:empty { display:none; }
		.model-pill { display:inline-flex; align-items:center; gap:5px; min-width:0; max-width:100%; padding:3px 8px; border:1px solid var(--vscode-widget-border, transparent); border-radius:20px; background:var(--vscode-input-background); color:var(--vscode-descriptionForeground); font-size:10px; font-weight:400; white-space:nowrap; }
		.model-pill strong { font-weight:600; color:var(--vscode-foreground); }
		.model-pill .model-name { display:inline-block; min-width:0; max-width:150px; overflow:hidden; text-overflow:ellipsis; }
		.model-pill .model-dot { width:5px; height:5px; flex:none; border-radius:50%; background:var(--vscode-textLink-foreground); }
		.model-pill { animation: model-appear 180ms ease-out both; }
		.agent-pill { display:inline-flex; align-items:center; max-width:160px; padding:3px 8px; border:1px solid var(--vscode-focusBorder); border-radius:20px; color:var(--vscode-textLink-foreground); font-size:10px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
		@keyframes model-appear { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
		.message .head { flex-wrap:wrap; }
        button.send { width:30px; height:28px; border-radius:8px; }
        button.icon { width:28px; height:28px; }
        .voice-panel { position:relative; padding:12px; margin-bottom:12px; border:1px solid var(--vscode-widget-border, transparent); border-radius:10px; background:var(--vscode-input-background); }
        .voice-reveal { display:grid; grid-template-rows:0fr; opacity:0; transform:translateY(14px) scale(.985); transform-origin:center bottom; transition:grid-template-rows 280ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease, transform 280ms cubic-bezier(.2,.8,.2,1), visibility 0s linear 280ms; pointer-events:none; visibility:hidden; }
        .voice-reveal.open { grid-template-rows:1fr; opacity:1; transform:translateY(0) scale(1); pointer-events:auto; visibility:visible; transition-delay:0s; }
        .voice-reveal > .voice-panel { min-height:0; overflow:hidden; margin-bottom:0; padding-block:0; border-width:0; transition:padding 280ms cubic-bezier(.2,.8,.2,1), margin 280ms; }
        .voice-reveal.open > .voice-panel { margin-bottom:12px; padding-block:12px; border-width:1px; }
        .voice-goo { position:absolute; bottom:0; left:50%; width:60px; height:16px; transform:translateX(-50%); pointer-events:none; opacity:.7; }
        .voice-goo-blob { display:block; width:48px; height:8px; border-radius:50%; background:var(--vscode-textLink-foreground); }
        @keyframes panel-enter { from { opacity:0; transform:translateY(9px) scale(.99); } to { opacity:1; transform:translateY(0) scale(1); } }
        .connection-panel, .review-panel { animation:panel-enter 240ms cubic-bezier(.2,.8,.2,1) both; }
        button:not(.mode) { transition:transform 135ms cubic-bezier(.2,.8,.2,1), background-color 160ms ease, border-color 160ms ease; }
        button:not(.mode):active:not(:disabled), button.pressed:not(.mode):not(:disabled) { transform:translateY(1px) scale(.965); }
        #hover-tip { position:fixed; z-index:50; max-width:260px; padding:6px 9px; border:1px solid var(--vscode-widget-border, var(--vscode-focusBorder)); border-radius:8px; background:var(--vscode-editorWidget-background, var(--vscode-dropdown-background)); color:var(--vscode-editorWidget-foreground, var(--vscode-foreground)); font-size:11px; box-shadow:0 6px 20px rgba(0,0,0,.18); opacity:0; transform:translateY(4px); transition:opacity 130ms ease, transform 130ms ease; pointer-events:none; }
        #hover-tip.visible { opacity:1; transform:translateY(0); }
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
			<select id="agentMode" hidden aria-label="Assistant mode"><option value="agent">Agent</option><option value="plan">Plan</option><option value="chat">Chat</option></select>
			<select id="model" hidden aria-label="Chat model"></select>
			<select id="codeModel" hidden aria-label="Agent model"></select>
			<div class="composer-controls">
				<button id="mode-trigger" class="composer-pick primary" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="mode"><span class="pick-value">Agent</span><span class="chevron" aria-hidden="true">▾</span></button>
				<button id="agent-trigger" class="composer-pick" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="agents"><span class="pick-label">Agent</span><span class="pick-value">Built-in agent</span><span class="chevron" aria-hidden="true">▾</span></button>
				<button id="routing-trigger" class="composer-pick routing-auto" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="routing"><span class="pick-value">Auto · Balanced</span><span class="chevron" aria-hidden="true">▾</span></button>
				<button id="model-trigger" class="composer-pick model-auto" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="models"><span class="pick-label">Model</span><span class="pick-value">Installed models</span><span class="chevron" aria-hidden="true">▾</span></button>
			</div>
			<button id="refresh" class="icon" type="button" data-tooltip="Refresh installed Ollama models" aria-label="Refresh installed models"><svg viewBox="0 0 16 16"><path d="M8 3a5 5 0 1 0 4.9 6h-1.5A3.5 3.5 0 1 1 8 4.5c.9 0 1.7.4 2.3 1L8.5 7.3H13V2.8l-1.7 1.7A5 5 0 0 0 8 3z"/></svg></button>
				<button id="attach" class="icon" type="button" data-tooltip="Include the active file or selected code in your next message" aria-label="Attach file or selected code"><svg viewBox="0 0 16 16"><path d="M6.5 13.5a3.5 3.5 0 0 1-3.5-3.5V5.5a2.5 2.5 0 0 1 5 0v4.7a1.5 1.5 0 0 1-3 0V6.5h1.3v3.7a.2.2 0 0 0 .4 0V5.5a1.2 1.2 0 0 0-2.4 0V10a2.2 2.2 0 0 0-4.4 0V5a3.5 3.5 0 1 1 7 0v5.2h-1.3V5a2.2 2.2 0 0 0-4.4 0v5a3.5 3.5 0 0 1-3.5 3.5z"/></svg></button>
			<span class="spacer"></span>
			<button id="send" class="send" type="button" title="Send (Enter)" aria-label="Send"><svg viewBox="0 0 16 16"><path d="M1.5 1.8l13 6.2-13 6.2 2.2-6.2z"/></svg></button>
		</div>
		<div class="route-hint" id="routeHint" aria-live="polite"></div>
	</div>
	<div id="picker-popover" role="menu" aria-label="Choose option"><div class="popover-goo" aria-hidden="true"></div><div class="popover-title"></div><div class="popover-options"></div></div>
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
		const pickerPopover = document.getElementById('picker-popover');
		const pickerTitle = pickerPopover.querySelector('.popover-title');
		const pickerOptions = pickerPopover.querySelector('.popover-options');
		let openMenu = '';
		let openTrigger = null;
		let projectAgents = [];
		let projectAgentError = '';
		const routeHint = document.getElementById('routeHint');
		const promptInput = document.getElementById('prompt');
		const statusElement = document.getElementById('status');
		const errorElement = document.getElementById('error');
		const sendButton = document.getElementById('send');
			const attachmentsElement = document.getElementById('attachment-chips');
		const savedState = vscode.getState() || {};
		let activeAgentId = typeof savedState.agentId === 'string' ? savedState.agentId : '';
		let lastManualChat = savedState.manualChatModel || '';
		let lastManualCode = savedState.manualCodeModel || '';
		let busy = false;
		const hoverTip = document.createElement('div');
		hoverTip.id = 'hover-tip';
		hoverTip.setAttribute('role', 'tooltip');
		document.body.append(hoverTip);
		let hoverTimer;
		let hoverTarget;
		function hideTip() { clearTimeout(hoverTimer); hoverTarget = undefined; hoverTip.classList.remove('visible'); }
		function showTip(button) {
			if (!button || button.disabled) return;
			hoverTip.textContent = button.dataset.tooltip;
			const rect = button.getBoundingClientRect();
			const width = Math.min(280, Math.max(130, hoverTip.textContent.length * 5.9));
			hoverTip.style.width = width + 'px';
			hoverTip.style.left = Math.max(8, Math.min(window.innerWidth - width - 24, rect.left + rect.width / 2 - width / 2)) + 'px';
			hoverTip.style.top = Math.max(8, rect.top - hoverTip.offsetHeight - 10) + 'px';
			hoverTip.classList.add('visible');
		}
		document.addEventListener('pointerover', event => {
			const target = event.target instanceof Element ? event.target.closest('[data-tooltip]') : null;
			if (!target || target === hoverTarget) return;
			hideTip(); hoverTarget = target;
			hoverTimer = setTimeout(() => showTip(target), 750);
		});
		document.addEventListener('pointerout', event => {
			if (hoverTarget && (!event.relatedTarget || !hoverTarget.contains(event.relatedTarget))) hideTip();
		});
		document.addEventListener('focusin', event => {
			const target = event.target instanceof Element ? event.target.closest('[data-tooltip]') : null;
			if (target) { hideTip(); hoverTarget = target; showTip(target); }
		});
		document.addEventListener('focusout', hideTip);
		document.addEventListener('click', event => {
			const button = event.target instanceof Element ? event.target.closest('button') : null;
			if (!button || button.disabled) return;
			button.classList.add('pressed');
			setTimeout(() => button.classList.remove('pressed'), 130);
		}, true);

		function render() {
			// The message feed is rendered by React; this only updates composer controls.
			sendButton.disabled = window.copilot.connection !== 'ready' || Boolean(window.copilot.review) || busy || window.copilot.recording || !promptInput.value.trim();
			const chatting = agentModeSelect.value === 'chat';
			const agentButton = document.getElementById('agent-trigger');
			agentButton.hidden = agentModeSelect.value !== 'agent';
			const currentAgent = projectAgents.find(agent => agent.id === activeAgentId);
			agentButton.querySelector('.pick-value').textContent = currentAgent ? currentAgent.name : 'Built-in agent';
			const chosen = chatting ? modelSelect.value : codeModelSelect.value;
			const automatic = chosen.startsWith('auto:');
			const tier = chosen === 'auto:fast' ? 'Fast' : chosen === 'auto:quality' ? 'Quality' : 'Balanced';
			routeHint.textContent = chosen.startsWith('auto:')
				? '✦ Auto · ' + tier + ' — selects an installed local model for each request.'
				: chosen ? 'Using ' + chosen + ' for ' + (chatting ? 'chat' : agentModeSelect.value) + '.' : '';
			document.getElementById('mode-trigger').querySelector('.pick-value').textContent = agentModeSelect.value[0].toUpperCase() + agentModeSelect.value.slice(1);
			const routingButton = document.getElementById('routing-trigger');
			routingButton.querySelector('.pick-value').textContent = automatic ? 'Auto · ' + tier : 'Manual';
			routingButton.classList.toggle('routing-auto', automatic);
			const modelButton = document.getElementById('model-trigger');
			modelButton.querySelector('.pick-value').textContent = automatic ? 'Installed models' : chosen || 'No models';
			modelButton.classList.toggle('model-auto', automatic);
			for (const trigger of document.querySelectorAll('[data-menu]')) trigger.disabled = busy;
			modelSelect.disabled = busy;
			codeModelSelect.disabled = busy;
			agentModeSelect.disabled = busy;
			document.getElementById('attach').disabled = busy;
			if (busy) closePicker();
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
			if (modelSelect.value && !modelSelect.value.startsWith('auto:')) lastManualChat = modelSelect.value;
			if (codeModelSelect.value && !codeModelSelect.value.startsWith('auto:')) lastManualCode = codeModelSelect.value;
			vscode.setState({ ...vscode.getState(), model: modelSelect.value, codeModel: codeModelSelect.value,
				manualChatModel: lastManualChat, manualCodeModel: lastManualCode });
		}

		function activeModelSelect() { return agentModeSelect.value === 'chat' ? modelSelect : codeModelSelect; }
		function closePicker(restoreFocus = false) {
			if (!openMenu) return;
			pickerPopover.classList.remove('open');
			if (openTrigger) openTrigger.setAttribute('aria-expanded', 'false');
			if (restoreFocus && openTrigger) openTrigger.focus();
			openMenu = '';
			openTrigger = null;
		}

		function menuOption(label, description, checked, action, disabled = false) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'popover-option';
			button.setAttribute('role', 'menuitemradio');
			button.setAttribute('aria-checked', String(checked));
			button.disabled = disabled;
			const copy = document.createElement('span');
			copy.className = 'option-copy';
			const heading = document.createElement('strong');
			heading.textContent = label;
			copy.append(heading);
			if (description) {
				const sub = document.createElement('small');
				sub.textContent = description;
				copy.append(sub);
			}
			button.append(copy);
			if (checked) { const check = document.createElement('span'); check.className = 'check'; check.textContent = '✓'; button.append(check); }
			button.addEventListener('click', () => { if (disabled) return; action(); closePicker(true); render(); });
			pickerOptions.append(button);
		}

		function openPicker(name, trigger) {
			if (busy) return;
			if (openMenu === name) { closePicker(true); return; }
			closePicker();
			pickerOptions.replaceChildren();
			pickerOptions.classList.remove('model-options');
			const selection = activeModelSelect();
			const auto = selection.value.startsWith('auto:');
			const caption = document.createElement('span');
			const secondary = document.createElement('span');
			pickerTitle.replaceChildren(caption, secondary);
			if (name === 'mode') {
				caption.textContent = 'Assistant mode';
				secondary.textContent = 'How can I help?';
				for (const [id, label, desc] of [
					['agent', 'Agent', 'Read, build, and edit with your approval'],
					['plan', 'Plan', 'Explore and plan without writing files'],
					['chat', 'Chat', 'Ask questions and explain code']
				]) menuOption(label, desc, agentModeSelect.value === id, () => {
					agentModeSelect.value = id;
					vscode.setState({ ...vscode.getState(), mode: id });
				});
			} else if (name === 'agents') {
				caption.textContent = 'Choose an agent';
				secondary.textContent = 'Project profiles';
				menuOption('Built-in agent', 'General-purpose coding with approval before changes', !activeAgentId, () => {
					activeAgentId = ''; vscode.setState({ ...vscode.getState(), agentId: '' });
				});
				for (const agent of projectAgents) menuOption(agent.name, agent.description || agent.id + '.agent.md', activeAgentId === agent.id, () => {
					activeAgentId = agent.id; vscode.setState({ ...vscode.getState(), agentId: activeAgentId });
				});
				if (projectAgentError) menuOption(projectAgentError, '', false, () => {}, true);
				menuOption('Refresh project agents', 'From .local-copilot/agents/', false, () => vscode.postMessage({ type: 'refreshAgents' }));
			} else if (name === 'routing') {
				caption.textContent = 'Model selection';
				secondary.textContent = 'Auto or Manual';
				for (const [id, label, desc] of [
					['auto:balanced', 'Auto · Balanced', 'Choose the best available model for the task'],
					['auto:fast', 'Auto · Fast', 'Prefer smaller, more responsive models'],
					['auto:quality', 'Auto · Quality', 'Prefer stronger reasoning and code generation']
				]) menuOption(label, desc, selection.value === id, () => { selection.value = id; rememberModels(); });
				const manual = [...selection.options].find(option => !option.disabled && !option.value.startsWith('auto:') && option.value);
				menuOption('Manual', 'Choose a specific installed model', !auto, () => {
					const preferred = agentModeSelect.value === 'chat' ? lastManualChat : lastManualCode;
					const option = [...selection.options].find(option => option.value === preferred && !option.disabled);
					selection.value = option ? preferred : manual.value;
					rememberModels();
				}, !manual);
			} else if (name === 'models') {
				caption.textContent = 'Installed models';
				secondary.textContent = auto ? 'Auto selected' : 'Choose one';
				const options = [...selection.options].filter(option => option.value && !option.value.startsWith('auto:'));
				if (!options.length) menuOption('No models installed', 'Refresh Ollama to discover models', false, () => {}, true);
				for (const option of options) menuOption(option.value, option.textContent.replace(option.value, '').replace(/^ · /, '') || 'Local Ollama model', selection.value === option.value,
					() => { selection.value = option.value; rememberModels(); }, option.disabled || auto);
				if (auto) {
					const filter = document.createElement('div');
					filter.className = 'popover-filter';
					filter.setAttribute('aria-label', 'Cannot pick a model in Auto mode');
					const message = document.createElement('span');
					message.textContent = "Can't pick a model in Auto mode";
					filter.append(message);
					pickerOptions.append(filter);
				}
			}
			openMenu = name;
			openTrigger = trigger;
			trigger.setAttribute('aria-expanded', 'true');
			pickerPopover.setAttribute('aria-label', caption.textContent);
			const bounds = trigger.getBoundingClientRect();
			const width = Math.min(340, window.innerWidth - 16);
			pickerPopover.style.width = width + 'px';
			pickerPopover.style.left = Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)) + 'px';
			pickerPopover.style.bottom = Math.max(0, window.innerHeight - bounds.top + 8) + 'px';
			pickerPopover.style.maxHeight = Math.max(80, Math.min(window.innerHeight * .55, bounds.top - 16)) + 'px';
			pickerPopover.classList.add('open');
			pickerOptions.querySelector('button:not(:disabled)')?.focus();
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
			vscode.postMessage({ type: 'sendMessage', model: modelSelect.value, codeModel: codeModelSelect.value,
				prompt, mode: agentModeSelect.value, agentId: agentModeSelect.value === 'agent' && activeAgentId ? activeAgentId : undefined });
			promptInput.value = '';
			vscode.setState({ ...vscode.getState(), draft: '' });
			autosize();
			render();
		}

		sendButton.addEventListener('click', sendMessage);
		document.getElementById('attach').addEventListener('click', () => vscode.postMessage({ type: 'attachEditor' }));
		document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refreshModels' }));
		for (const trigger of document.querySelectorAll('[data-menu]')) {
			trigger.addEventListener('click', () => openPicker(trigger.dataset.menu, trigger));
		}
		document.addEventListener('pointerdown', event => {
			if (openMenu && !pickerPopover.contains(event.target) && !openTrigger?.contains(event.target)) closePicker();
		});
		document.addEventListener('focusin', event => {
			if (openMenu && !pickerPopover.contains(event.target) && !openTrigger?.contains(event.target)) closePicker();
		});
		document.addEventListener('keydown', event => {
			if (!openMenu) return;
			if (event.key === 'Escape') { event.preventDefault(); closePicker(true); return; }
			if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
			const options = [...pickerOptions.querySelectorAll('button:not(:disabled)')];
			if (!options.length) return;
			event.preventDefault();
			const index = options.indexOf(document.activeElement);
			let target = index;
			if (event.key === 'Home') target = 0;
			else if (event.key === 'End') target = options.length - 1;
			else if (event.key === 'ArrowDown') target = (index + 1) % options.length;
			else target = (index - 1 + options.length) % options.length;
			options[target].focus();
		});
		window.addEventListener('resize', () => closePicker());
		window.addEventListener('scroll', event => {
			if (!pickerOptions.contains(event.target) && event.target !== pickerOptions) closePicker();
		}, true);
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
				closePicker();
				fillModelSelect(modelSelect, message.models, message.defaultModel, savedState.model, message.capabilities);
				fillModelSelect(codeModelSelect, message.models, message.defaultCodeModel, savedState.codeModel, message.capabilities, true);
				rememberModels();
				render();
				if (!message.models.length) setStatus('No models found; pull one with Ollama first.');
			} else if (message.type === 'agents') {
				closePicker();
				projectAgents = Array.isArray(message.agents) ? message.agents : [];
				projectAgentError = message.error || '';
				if (activeAgentId && !projectAgents.some(agent => agent.id === activeAgentId)) {
					activeAgentId = '';
					vscode.setState({ ...vscode.getState(), agentId: '' });
				}
				render();
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
