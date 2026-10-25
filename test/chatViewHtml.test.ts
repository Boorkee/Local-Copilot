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

	it('includes model selection, chat, error/status, and explicit apply controls', () => {
		const html = createChatViewHtml();

		for (const expected of [
			'id="model"',
			'id="messages"',
			'id="status"',
			'id="error"',
			'id="prompt"',
			'id="send"',
			'id="apply"',
			'type: \'sendMessage\'',
			'type: \'refreshModels\'',
			'type: \'applyCode\''
		]) {
			assert.ok(html.includes(expected), `Expected webview HTML to include ${expected}`);
		}
	});

	it('renders model and message text using textContent rather than HTML injection', () => {
		const html = createChatViewHtml();

		assert.match(html, /option\.textContent = name/);
		assert.match(html, /text\.textContent = content/);
	});

	it('ignores Enter submissions while another chat request is pending', () => {
		const html = createChatViewHtml();

		assert.match(html, /if \(!prompt \|\| sendButton\.disabled\) return;/);
	});

	it('offers a code-model picker and routes /code messages to delegation', () => {
		const html = createChatViewHtml();

		assert.ok(html.includes('id="codeModel"'));
		assert.match(html, /type: 'delegate'/);
		assert.match(html, /prompt\.startsWith\('\/code'\)/);
		assert.match(html, /history\.push\(\.\.\.message\.historyAdditions\)/);
	});

	it('follows the VS Code theme and fills the resizable view', () => {
		const html = createChatViewHtml();

		assert.match(html, /var\(--vscode-sideBar-background\)/);
		assert.match(html, /var\(--vscode-foreground\)/);
		assert.match(html, /var\(--vscode-font-family\)/);
		assert.match(html, /body \{[^}]*display: flex; flex-direction: column/);
		assert.match(html, /#messages \{[^}]*flex: 1 1 auto/);
		assert.doesNotMatch(html, /max-height: 45vh/);
		assert.doesNotMatch(html, /#[0-9a-fA-F]{3,6}\b/);
	});

	it('emits a webview script that parses as valid JavaScript', () => {
		const html = createChatViewHtml();
		const script = html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)?.[1];

		assert.ok(script);
		assert.doesNotThrow(() => new Function(script));
	});
});
