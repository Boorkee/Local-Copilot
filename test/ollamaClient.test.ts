import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ChatMessage, OllamaClient } from '../src/ollamaClient';

type CapturedRequest = {
	url: URL;
	init: RequestInit;
};

const clients: OllamaClient[] = [];

afterEach(() => {
	clients.length = 0;
});

function createClient(
	handler: (request: CapturedRequest) => Promise<Response>,
	timeoutMs = 1000
): { client: OllamaClient; requests: CapturedRequest[] } {
	const requests: CapturedRequest[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		const request = { url: new URL(input.toString()), init: init ?? {} };
		requests.push(request);
		return handler(request);
	};
	const client = new OllamaClient('http://localhost:11434/', timeoutMs, fetcher);
	clients.push(client);
	return { client, requests };
}

function jsonResponse(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), { status });
}

function bodyOf(request: CapturedRequest): Record<string, unknown> {
	return JSON.parse(String(request.init.body)) as Record<string, unknown>;
}

describe('OllamaClient.listModels', () => {
	it('fetches model tags and returns the listed models', async () => {
		const { client, requests } = createClient(async () => jsonResponse({ models: [{ name: 'coder:7b' }] }));

		assert.deepEqual(await client.listModels(), [{ name: 'coder:7b' }]);
		assert.equal(requests[0].url.href, 'http://localhost:11434/api/tags');
		assert.equal(requests[0].init.method, 'GET');
	});

	it('rejects a malformed model list', async () => {
		const { client } = createClient(async () => jsonResponse({ models: 'coder:7b' }));

		await assert.rejects(client.listModels(), /invalid model list/);
	});
});

describe('OllamaClient.chat', () => {
	it('unloads every loaded model with an empty keep_alive: 0 request before chat', async () => {
		const { client, requests } = createClient(async request => {
			if (request.url.pathname === '/api/ps') {
				return jsonResponse({ models: [{ name: 'large:latest' }, { model: 'small:latest' }] });
			}
			if (request.url.pathname === '/api/generate') {
				return jsonResponse({});
			}
			return jsonResponse({ message: { content: 'done' } });
		});
		const history: ChatMessage[] = [{ role: 'user', content: 'prior' }, { role: 'assistant', content: 'answer' }];

		assert.equal(await client.chat('small:latest', 'implement this', history), 'done');
		assert.deepEqual(requests.map(request => request.url.pathname), [
			'/api/ps',
			'/api/generate',
			'/api/generate',
			'/api/chat'
		]);
		assert.deepEqual(requests.slice(1, 3).map(bodyOf), [
			{ model: 'large:latest', prompt: '', stream: false, keep_alive: 0 },
			{ model: 'small:latest', prompt: '', stream: false, keep_alive: 0 }
		]);
		for (const request of requests.slice(1, 3)) {
			assert.equal(request.init.method, 'POST');
		}
		assert.deepEqual(bodyOf(requests[3]), {
			model: 'small:latest',
			messages: [...history, { role: 'user', content: 'implement this' }],
			stream: false
		});
	});

	it('does not repeat the unload handshake when continuing with the active model', async () => {
		let runningModelsCalls = 0;
		const { client, requests } = createClient(async request => {
			if (request.url.pathname === '/api/ps') {
				runningModelsCalls++;
				return jsonResponse({ models: [{ name: 'coder:7b' }] });
			}
			if (request.url.pathname === '/api/generate') {
				return jsonResponse({});
			}
			return jsonResponse({ message: { content: 'ok' } });
		});

		await client.chat('coder:7b', 'first', []);
		await client.chat('coder:7b', 'second', []);

		assert.equal(runningModelsCalls, 1);
		assert.equal(requests.filter(request => request.url.pathname === '/api/chat').length, 2);
	});

	it('unloads previously active models even when Ollama omits them from /api/ps', async () => {
		const unloaded: string[] = [];
		let chatCalls = 0;
		const { client } = createClient(async request => {
			if (request.url.pathname === '/api/ps') {
				return jsonResponse({ models: [] });
			}
			if (request.url.pathname === '/api/generate') {
				unloaded.push(String(bodyOf(request).model));
				return jsonResponse({});
			}
			chatCalls++;
			return jsonResponse({ message: { content: 'ok' } });
		});

		await client.chat('first:7b', 'first', []);
		await client.chat('second:14b', 'second', []);

		assert.deepEqual(unloaded, ['first:7b']);
		assert.equal(chatCalls, 2);
	});

	it('unloads duplicate loaded-model entries only once', async () => {
		const unloaded: string[] = [];
		const { client } = createClient(async request => {
			if (request.url.pathname === '/api/ps') {
				return jsonResponse({ models: [{ name: 'same:latest' }, { model: 'same:latest' }] });
			}
			if (request.url.pathname === '/api/generate') {
				unloaded.push(String(bodyOf(request).model));
				return jsonResponse({});
			}
			return jsonResponse({ message: { content: 'ok' } });
		});

		await client.chat('next:latest', 'hello', []);

		assert.deepEqual(unloaded, ['same:latest']);
	});

	it('repeats the unload handshake after a partial model unload fails', async () => {
		let failedUnload = false;
		let oldModelChatCalls = 0;
		let processListCalls = 0;
		const { client, requests } = createClient(async request => {
			if (request.url.pathname === '/api/ps') {
				processListCalls++;
				if (processListCalls === 1) {
					return jsonResponse({ models: [] });
				}
				return jsonResponse({ models: [{ name: 'old:latest' }, { name: 'new:latest' }] });
			}
			if (request.url.pathname === '/api/generate') {
				const model = bodyOf(request).model;
				if (model === 'new:latest' && !failedUnload) {
					failedUnload = true;
					return new Response('unload failed', { status: 500 });
				}
				return jsonResponse({});
			}
			if (bodyOf(request).model === 'old:latest') {
				oldModelChatCalls++;
			}
			return jsonResponse({ message: { content: 'ok' } });
		});

		await client.chat('old:latest', 'first', []);
		await assert.rejects(client.chat('new:latest', 'switch', []), /unload failed/);
		await client.chat('old:latest', 'retry old model', []);

		assert.equal(oldModelChatCalls, 2);
		assert.equal(requests.filter(request => request.url.pathname === '/api/ps').length, 3);
		assert.deepEqual(requests.slice(-4).map(request => request.url.pathname), [
			'/api/ps',
			'/api/generate',
			'/api/generate',
			'/api/chat'
		]);
	});

	it('serializes concurrent chats so model unload and chat requests cannot overlap', async () => {
		let resumeFirstProcessList: (() => void) | undefined;
		let firstProcessListStarted: (() => void) | undefined;
		const firstProcessList = new Promise<void>(resolve => {
			firstProcessListStarted = resolve;
		});
		const waitForFirstProcessList = new Promise<void>(resolve => {
			resumeFirstProcessList = resolve;
		});
		let processListCalls = 0;
		const paths: string[] = [];
		const { client } = createClient(async request => {
			paths.push(request.url.pathname);
			if (request.url.pathname === '/api/ps') {
				processListCalls++;
				if (processListCalls === 1) {
					firstProcessListStarted?.();
					await waitForFirstProcessList;
					return jsonResponse({ models: [] });
				}
				return jsonResponse({ models: [{ name: 'first:latest' }] });
			}
			if (request.url.pathname === '/api/generate') {
				return jsonResponse({});
			}
			return jsonResponse({ message: { content: 'ok' } });
		});

		const firstChat = client.chat('first:latest', 'first prompt', []);
		await firstProcessList;
		const secondChat = client.chat('second:latest', 'second prompt', []);
		assert.equal(processListCalls, 1);
		resumeFirstProcessList?.();
		await Promise.all([firstChat, secondChat]);

		assert.deepEqual(paths, [
			'/api/ps',
			'/api/chat',
			'/api/ps',
			'/api/generate',
			'/api/chat'
		]);
	});

	it('stops before chat if the loaded-model list is malformed', async () => {
		const { client, requests } = createClient(async () => jsonResponse({ models: null }));

		await assert.rejects(client.chat('coder:7b', 'hello', []), /invalid loaded-model list/);
		assert.deepEqual(requests.map(request => request.url.pathname), ['/api/ps']);
	});

	it('stops before chat if a loaded-model entry has no valid name', async () => {
		const { client, requests } = createClient(async () => jsonResponse({ models: [{}] }));

		await assert.rejects(client.chat('coder:7b', 'hello', []), /invalid loaded-model entry/);
		assert.deepEqual(requests.map(request => request.url.pathname), ['/api/ps']);
	});

	it('reports Ollama chat errors and missing response content', async () => {
		const errorClient = createClient(async request => request.url.pathname === '/api/ps'
			? jsonResponse({ models: [] })
			: jsonResponse({ error: 'model unavailable' })).client;
		await assert.rejects(errorClient.chat('coder:7b', 'hello', []), /model unavailable/);

		const contentClient = createClient(async request => request.url.pathname === '/api/ps'
			? jsonResponse({ models: [] })
			: jsonResponse({ message: {} })).client;
		await assert.rejects(contentClient.chat('coder:7b', 'hello', []), /without message content/);
	});
});

describe('OllamaClient request failures', () => {
	it('includes HTTP status and bounded response detail', async () => {
		const { client } = createClient(async () => new Response('x'.repeat(600), { status: 503 }));

		await assert.rejects(client.listModels(), error => {
			assert.match(String(error), /Ollama request failed \(503\)/);
			assert.equal((error as Error).message.length, 'Ollama request failed (503): '.length + 500);
			return true;
		});
	});

	it('rejects invalid JSON responses', async () => {
		const { client } = createClient(async () => new Response('not json'));

		await assert.rejects(client.listModels(), /invalid JSON from \/api\/tags/);
	});

	it('aborts requests that exceed the configured timeout', async () => {
		const { client } = createClient(request => new Promise<Response>((_resolve, reject) => {
			request.init.signal?.addEventListener('abort', () => {
				const error = new Error('aborted');
				error.name = 'AbortError';
				reject(error);
			});
		}), 5);

		await assert.rejects(client.listModels(), /timed out after 5 ms/);
	});
});
