import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createChatViewHtml } from '../src/chatViewHtml';

describe('createChatViewHtml', () => {
	it('renders a nonce-protected webview with matching CSP and script nonce', () => {
		const html = createChatViewHtml();
		const nonce = html.match(/<script nonce="([^"]+)">/)?.[1];

		assert.ok(nonce);
		assert.match(nonce, /^[A-Za-z0-9]{32}$/);
		assert.ok(html.includes(`script-src 'nonce-${nonce}'`));
		assert.notEqual(nonce, createChatViewHtml().match(/<script nonce="([^"]+)">/)?.[1]);
	});

	it('includes the message list, status/error areas, composer, and model pickers', () => {
		const html = createChatViewHtml();

		for (const expected of [
			'id="messages"',
			'id="status"',
			'id="error"',
			'id="prompt"',
			'id="send"',
			'id="model"',
			'id="codeModel"',
			'id="refresh"',
			'id="attach"',
			'id="attachment-chips"',
			'type: \'sendMessage\'',
			'type: \'refreshModels\''
		]) {
			assert.ok(html.includes(expected), `Expected webview HTML to include ${expected}`);
		}
	});

	it('places the model pickers in the composer toolbar below the text box', () => {
		const html = createChatViewHtml();
		const textarea = html.indexOf('<textarea id="prompt"');
		const toolbar = html.indexOf('class="toolbar"');
		const chatModel = html.indexOf('id="model"');
		const codeModel = html.indexOf('id="codeModel"');
		const send = html.indexOf('id="send"');

		assert.ok(textarea > 0 && textarea < toolbar);
		assert.ok(toolbar < chatModel && chatModel < codeModel && codeModel < send);
	});

	it('keeps model names inert and leaves transcript rendering to React', () => {
		const html = createChatViewHtml();

		assert.match(html, /option\.textContent = name/);
		assert.doesNotMatch(html, /messagesElement\.replaceChildren/);
		assert.doesNotMatch(html, /innerHTML/);
	});

	it('ignores submissions while another chat request is pending', () => {
		const html = createChatViewHtml();

		assert.match(html, /if \(!prompt \|\| busy\) return;/);
	});

	it('routes natural-language tasks directly to the agent without /code', () => {
		const html = createChatViewHtml();

		assert.doesNotMatch(html, /type: 'delegate'/);
		assert.doesNotMatch(html, /prompt\.startsWith\('\/code'\)/);
		assert.match(html, /type: 'sendMessage'/);
	});

	it('offers separate routing, model, and project-agent menus', () => {
		const html = createChatViewHtml();
		for (const text of ['auto:balanced', 'auto:fast', 'auto:quality', 'routing-trigger', 'model-trigger',
			'agent-trigger', 'mode-trigger', 'picker-popover', 'routeHint', "Can't pick a model in Auto mode", 'refreshAgents'])
			assert.ok(html.includes(text));
		assert.match(html, /agentModeSelect\.addEventListener\('change'/);
		assert.match(html, /event\.key === 'Escape'/);
		assert.match(html, /menuOption\('Manual'/);
		assert.match(html, /command \? 'menuitem' : 'menuitemradio'/);
		assert.match(html, /!projectAgentError && activeAgentId/);
	});

	it('announces finished tasks without speaking every streamed token', () => {
		const html = createChatViewHtml();
		assert.match(html, /id="messages" aria-label="Conversation"/);
		assert.doesNotMatch(html, /id="messages" aria-live=/);
		assert.match(html, /id="announcements"[^>]*aria-live="polite"/);
		assert.match(html, /message\.type === 'taskFinished'/);
	});

	it('leaves chat history to the extension host so it survives the view being moved', () => {
		const html = createChatViewHtml();

		assert.match(html, /message\.type === 'state'/);
		assert.doesNotMatch(html, /history: \[\.\.\.history\]/);
	});

	it('follows the VS Code theme and fills the resizable view', () => {
		const html = createChatViewHtml();

		assert.match(html, /var\(--vscode-sideBar-background\)/);
		assert.match(html, /var\(--vscode-foreground\)/);
		assert.match(html, /var\(--vscode-font-family\)/);
		assert.match(html, /var\(--vscode-input-background\)/);
		assert.match(html, /body \{[^}]*display: flex; flex-direction: column/);
		assert.match(html, /#messages \{[^}]*flex: 1 1 auto/);
		assert.doesNotMatch(html, /max-height: 45vh/);
		assert.doesNotMatch(html, /#[0-9a-fA-F]{3,6}\b/);
	});

	it('keeps text and controls compact', () => {
		const html = createChatViewHtml();

		assert.match(html, /--base: calc\(var\(--vscode-font-size\) \* 0\.92\)/);
		assert.match(html, /button\.icon \{[^}]*width: 22px; height: 22px/);
		assert.match(html, /button\.send \{[^}]*width: 24px; height: 22px/);
	});

	it('centers wide layouts and includes reduced motion and tactile feedback', () => {
		const html = createChatViewHtml();
		assert.match(html, /#messages > \.message \{[^}]*max-width:840px; margin-inline:auto/);
		assert.match(html, /#effects \{[^}]*max-width:868px; margin-inline:auto/);
		assert.match(html, /\.voice-reveal\.open/);
		assert.match(html, /button\.pressed:not\(\.mode\)/);
		assert.match(html, /setTimeout\(\(\) => showTip\(target\), 750\)/);
		assert.match(html, /@media \(prefers-reduced-motion:reduce\)/);
		assert.match(html, /\.voice-reveal \{ transform:none; transition:grid-template-rows 220ms ease, opacity 180ms ease/);
		assert.match(html, /#picker-popover \{ transform:none; transition:opacity 180ms ease/);
		assert.match(html, /\.connection-panel, \.review-panel, \.model-pill \{ animation:soft-appear 180ms ease-out both/);
		assert.doesNotMatch(html, /transition:none !important/);
	});

	it('emits a webview script that parses as valid JavaScript', () => {
		const html = createChatViewHtml();
		const script = html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)?.[1];

		assert.ok(script);
		assert.doesNotThrow(() => new Function(script));
	});
});
