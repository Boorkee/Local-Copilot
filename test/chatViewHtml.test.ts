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
			'type: \'sendMessage\'',
			'type: \'refreshModels\'',
			'type: \'applyCode\'',
			'type: \'copyCode\''
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

	it('renders model and message text using textContent rather than HTML injection', () => {
		const html = createChatViewHtml();

		assert.match(html, /option\.textContent = name/);
		assert.match(html, /body\.textContent = code/);
		assert.match(html, /node\.textContent = text\.slice/);
		assert.doesNotMatch(html, /innerHTML/);
	});

	it('ignores submissions while another chat request is pending', () => {
		const html = createChatViewHtml();

		assert.match(html, /if \(!prompt \|\| busy\) return;/);
	});

	it('routes /code messages to delegation and everything else to normal chat', () => {
		const html = createChatViewHtml();

		assert.match(html, /type: 'delegate'/);
		assert.match(html, /prompt\.startsWith\('\/code'\)/);
		assert.match(html, /type: 'sendMessage'/);
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

	it('emits a webview script that parses as valid JavaScript', () => {
		const html = createChatViewHtml();
		const script = html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)?.[1];

		assert.ok(script);
		assert.doesNotThrow(() => new Function(script));
	});
});
