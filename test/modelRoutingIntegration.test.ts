import assert from 'node:assert/strict';
import { it } from 'node:test';
import { OllamaClient } from '../src/ollamaClient';
import { chooseModel, ModelCatalogEntry, runWithModelFallback } from '../src/modelRouter';

it('routes successive Ollama requests between local models without losing chat history', async () => {
    const used: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
        const path = new URL(input.toString()).pathname;
        const body = init?.body ? JSON.parse(String(init.body)) as { model: string; messages?: unknown[] } : undefined;
        if (path === '/api/tags') return new Response(JSON.stringify({ models: [
            { name: 'large', size: 8_000_000_000, details: { parameter_size: '14B' } },
            { name: 'small', size: 2_000_000_000, details: { parameter_size: '3B' } }
        ] }));
        if (path === '/api/show') return new Response(JSON.stringify({ capabilities: ['completion', 'tools'] }));
        if (path === '/api/chat') {
            used.push(body!.model);
            if (used.length === 2) assert.deepEqual(body!.messages, [
                { role: 'user', content: 'hello' }, { role: 'assistant', content: 'response from small' },
                { role: 'user', content: 'Please refactor and test this module' }
            ]);
            return new Response(JSON.stringify({ message: { content: `response from ${body!.model}` } }),
                { headers: { 'content-type': 'application/json' } });
        }
        return new Response('unexpected path', { status: 404 });
    };
    const client = new OllamaClient('http://localhost:11434', 1000, fetcher);
    const installed = await client.listModels();
    const catalog: ModelCatalogEntry[] = await Promise.all(installed.map(async model => ({ ...model, capability: await client.inspectModel(model.name) })));
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const prompt of ['hello', 'Please refactor and test this module']) {
        const choice = chooseModel({ selected: 'auto:balanced', mode: 'chat', prompt, catalog, historyCount: history.length, hasAttachment: false });
        const { result, model } = await runWithModelFallback(choice, new AbortController().signal,
            async (name, markStarted) => client.chat(name, prompt, history, { onDelta: markStarted }), () => {});
        assert.equal(result, `response from ${model}`);
        history.push({ role: 'user', content: prompt }, { role: 'assistant', content: result });
    }
    assert.deepEqual(used, ['small', 'large']);
});

it('falls back on a failed model load without redoing generated content', async () => {
    const attempts: string[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
        const model = (JSON.parse(String(init!.body)) as { model: string }).model;
        attempts.push(model);
        if (model === 'small') return new Response('model temporarily unavailable', { status: 503 });
        return new Response(JSON.stringify({ message: { content: 'ready' } }), { headers: { 'content-type': 'application/json' } });
    };
    const client = new OllamaClient('http://localhost:11434', 1000, fetcher);
    const catalog: ModelCatalogEntry[] = [
        { name: 'small', size: 2_000_000_000, capability: 'tools' },
        { name: 'large', size: 8_000_000_000, capability: 'tools' }
    ];
    const choice = chooseModel({ selected: 'auto:fast', mode: 'chat', prompt: 'hello', catalog, historyCount: 0, hasAttachment: false });
    const result = await runWithModelFallback(choice, new AbortController().signal,
        (name, markStarted) => client.chat(name, 'hello', [], { onDelta: markStarted }), () => {});
    assert.equal(result.model, 'large');
    assert.equal(result.result, 'ready');
    assert.deepEqual(attempts, ['small', 'large']);
});
