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

describe('Ollama model capabilities', () => {
    it('detects tool-capable and chat-only models using local metadata', async () => {
        const { client, requests } = createClient(async request => jsonResponse({
            capabilities: bodyOf(request).model === 'agent:7b' ? ['completion', 'tools'] : ['completion']
        }));
        assert.equal(client.cachedCapability('agent:7b'), 'unknown');
        assert.equal(await client.inspectModel('agent:7b'), 'tools');
        assert.equal(await client.inspectModel('chat:7b'), 'chat');
        assert.equal(client.cachedCapability('agent:7b'), 'tools');
        assert.deepEqual(requests.map(request => request.url.pathname), ['/api/show', '/api/show']);
    });

    it('does not guess capabilities when an older server omits metadata', async () => {
        const { client } = createClient(async () => jsonResponse({}));
        assert.equal(await client.inspectModel('unknown:7b'), 'unknown');
    });
});

describe('OllamaClient.chat and streaming', () => {
    it('streams by default without unloading models owned by other clients', async () => {
        const { client, requests } = createClient(async () => jsonResponse({ message: { content: 'done' } }));
        const history: ChatMessage[] = [{ role: 'user', content: 'prior' }];
        const deltas: string[] = [];
        assert.equal(await client.chat('small:latest', 'implement this', history, { onDelta: delta => deltas.push(delta) }), 'done');
        assert.equal(await client.chat('large:latest', 'new prompt', []), 'done');
        assert.deepEqual(requests.map(request => request.url.pathname), ['/api/chat', '/api/chat']);
        assert.deepEqual(bodyOf(requests[0]), { model: 'small:latest', messages: [...history, { role: 'user', content: 'implement this' }], stream: true });
        assert.deepEqual(deltas, ['done']);
    });

    it('unloads only our previous model with opt-in conserve and supports keep', async () => {
        const calls: CapturedRequest[] = [];
        const fetcher: typeof fetch = async (input, init) => {
            calls.push({ url: new URL(input.toString()), init: init ?? {} });
            return jsonResponse({ message: { content: 'ok' } });
        };
        const conserve = new OllamaClient('http://localhost:11434', 1000, fetcher, 'conserve');
        await conserve.chat('one:7b', 'first', []);
        await conserve.chat('two:14b', 'second', []);
        await conserve.chat('two:14b', 'third', []);
        assert.deepEqual(calls.map(call => call.url.pathname), ['/api/chat', '/api/generate', '/api/chat', '/api/chat']);
        assert.deepEqual(bodyOf(calls[1]), { model: 'one:7b', prompt: '', stream: false, keep_alive: 0 });

        const keep = new OllamaClient('http://localhost:11434', 1000, fetcher, 'keep');
        await keep.chat('small:latest', 'hello', []);
        assert.equal(bodyOf(calls.at(-1)!).keep_alive, -1);
    });

    it('serializes requests while keeping the queue responsive to cancellation', async () => {
        let release!: () => void;
        let started!: () => void;
        const waiting = new Promise<void>(resolve => { release = resolve; });
        const firstStarted = new Promise<void>(resolve => { started = resolve; });
        const { client, requests } = createClient(async () => {
            if (requests.length === 1) { started(); await waiting; }
            return jsonResponse({ message: { content: 'ok' } });
        });
        const first = client.chat('one', 'first', []);
        await firstStarted;
        const controller = new AbortController();
        const second = client.chat('two', 'second', [], { signal: controller.signal });
        controller.abort();
        release();
        await first;
        await assert.rejects(second, /aborted/);
        assert.equal(requests.length, 1);
    });

    it('joins fragmented ndjson and delivers deltas before completion', async () => {
        const encoder = new TextEncoder();
        let finish!: () => void;
        const completed = new Promise<void>(resolve => { finish = resolve; });
        const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
                controller.enqueue(encoder.encode('{"message":{"content":"Hel'));
                controller.enqueue(encoder.encode('lo "}}\n{"message":{"content":"🌙"}}\n'));
                await completed;
                controller.enqueue(encoder.encode('{"done":true}\n'));
                controller.close();
            }
        });
        const { client } = createClient(async () => new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }));
        const deltas: string[] = [];
        const result = client.chat('coder', 'hello', [], { onDelta: delta => { deltas.push(delta); if (deltas.length === 2) finish(); } });
        assert.equal(await result, 'Hello 🌙');
        assert.deepEqual(deltas, ['Hello ', '🌙']);
    });

    it('aggregates indexed tool arguments and multiple tool calls', async () => {
        const lines = [
            { message: { tool_calls: [{ index: 0, function: { name: 'read_', arguments: '{"path":' } }] } },
            { message: { tool_calls: [{ index: 0, function: { name: 'file', arguments: '"src/a.ts"}' } }] } },
            { message: { tool_calls: [{ index: 1, function: { name: 'list_files', arguments: {} } }] } },
            { done: true }
        ];
        const { client } = createClient(async () => new Response(lines.map(line => JSON.stringify(line)).join('\n') + '\n', {
            headers: { 'content-type': 'application/x-ndjson' }
        }));
        const reply = await client.complete('coder', [{ role: 'user', content: 'inspect' }], []);
        assert.deepEqual(reply.tool_calls, [
            { function: { name: 'read_file', arguments: { path: 'src/a.ts' } } },
            { function: { name: 'list_files', arguments: {} } }
        ]);
    });

    it('reports stream errors, invalid events, and incomplete tool calls', async () => {
        for (const [stream, expected] of [
            ['{"error":"model unloaded"}\n', /model unloaded/],
            ['not json\n', /malformed streamed JSON/],
            ['{"message":{"tool_calls":"invalid"}}\n', /invalid tool calls/],
            ['{"message":{"tool_calls":[{"index":0,"function":{"name":"edit","arguments":"{"}}]}}\n', /invalid streamed tool arguments/],
            ['{"done":true}\n', /without message content/]
        ] as const) {
            const { client } = createClient(async () => new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }));
            await assert.rejects(client.chat('coder', 'prompt', []), expected);
        }
    });

    it('stops a streaming request when the user cancels', async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(encoder.encode('{"message":{"content":"first"}}\n')); }
        });
        const { client } = createClient(async () => new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }));
        await assert.rejects(client.chat('coder', 'prompt', [], { onDelta: () => client.cancelRequests() }), /cancelled/);
    });

    it('times out an idle response stream', async () => {
        const stream = new ReadableStream<Uint8Array>({ start() {} });
        const { client } = createClient(async () => new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }), 5);
        await assert.rejects(client.chat('coder', 'prompt', []), /timed out after 5 ms/);
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

it('explains connection failures with the configured server and recovery steps', async () => {
    const client = new OllamaClient('http://127.0.0.1:11434', 1000, (async () => { throw new TypeError('fetch failed'); }) as typeof fetch);
    await assert.rejects(() => client.listModels(), /Cannot reach Ollama at http:\/\/127.0.0.1:11434.*Start Ollama/);
});
