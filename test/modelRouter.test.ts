import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chooseModel, isRecoverableModelError, parameterCount, runWithModelFallback, taskComplexity } from '../src/modelRouter';
import type { ModelCatalogEntry } from '../src/modelRouter';

const catalog: ModelCatalogEntry[] = [
    { name: 'large', size: 8_000_000_000, details: { parameter_size: '14B' }, capability: 'tools' },
    { name: 'tiny', size: 1_000_000_000, details: { parameter_size: '1.5B' }, capability: 'chat' },
    { name: 'medium', size: 4_000_000_000, details: { parameter_size: '7B' }, capability: 'tools' }
];

function choose(selected: string, mode: 'chat' | 'agent' | 'plan' = 'chat', prompt = 'hi', list = catalog) {
    return chooseModel({ selected, mode, prompt, catalog: list, hasAttachment: false, historyCount: 0 });
}

describe('local model routing', () => {
    it('parses Ollama parameter sizes without guessing arbitrary tags', () => {
        assert.equal(parameterCount('1.5B'), 1_500_000_000);
        assert.equal(parameterCount(' 14B '), 14_000_000_000);
        assert.equal(parameterCount('800M'), 800_000_000);
        assert.equal(parameterCount('2T'), 2_000_000_000_000);
        assert.equal(parameterCount('qwen:7b'), undefined);
    });

    it('uses task and tier to select a model for each request', () => {
        assert.equal(choose('auto:balanced').model, 'tiny');
        assert.equal(choose('auto:balanced', 'chat', 'Please refactor this module and add tests').model, 'large');
        assert.equal(choose('auto:fast', 'chat', 'Please refactor this module and add tests').model, 'tiny');
        assert.equal(choose('auto:quality').model, 'large');
        assert.equal(choose('auto:balanced', 'agent').model, 'medium');
        assert.equal(choose('auto:balanced', 'agent', 'Refactor a complex repository').model, 'large');
        assert.equal(choose('auto:fast', 'plan').model, 'medium');
        assert.equal(choose('auto:quality', 'plan').model, 'large');
        assert.equal(choose('auto:balanced', 'agent').candidates.join(','), 'medium,large');
    });

    it('uses attachments, prompt length and conversation depth as complexity signals', () => {
        assert.equal(taskComplexity('hi', 'chat', false, 0), 'quick');
        assert.equal(taskComplexity('hi', 'chat', true, 0), 'involved');
        assert.equal(taskComplexity('hi', 'agent', false, 10), 'involved');
        assert.equal(taskComplexity('a'.repeat(500), 'chat', false, 0), 'involved');
    });

    it('rejects incompatible Auto candidates, missing models and invalid manual selections', () => {
        assert.throws(() => choose('auto:balanced', 'agent', 'hi', catalog.slice(1, 2)), /tool-capable/);
        assert.throws(() => choose('tiny', 'agent'), /does not support tools/);
        assert.throws(() => choose('missing'), /no longer installed/);
        assert.throws(() => choose('auto:balanced', 'chat', 'hi', []), /No Ollama models/);
        assert.equal(choose('large', 'chat').automatic, false);
        assert.deepEqual(choose('large', 'chat').candidates, ['large']);
		const embedded: ModelCatalogEntry = { name: 'embed', capability: 'unsupported', size: 100 };
		assert.equal(choose('auto:fast', 'chat', 'hi', [embedded, ...catalog]).model, 'tiny');
		assert.throws(() => choose('embed', 'chat', 'hi', [embedded, ...catalog]), /cannot run chat/);
    });

    it('sorts deterministically with older Ollama metadata', () => {
        const older: ModelCatalogEntry[] = [
            { name: 'z', capability: 'tools' },
            { name: 'a', size: 100, capability: 'tools' },
            { name: 'b', size: 50, capability: 'tools' }
        ];
        assert.equal(choose('auto:fast', 'agent', 'hi', older).model, 'b');
        assert.equal(choose('auto:quality', 'agent', 'hi', older).model, 'a');
        assert.deepEqual(choose('auto:quality', 'agent', 'hi', older).candidates, ['a', 'b', 'z']);
        assert.equal(choose('auto:balanced', 'chat', 'hi', older).model, 'b');
		const mixed: ModelCatalogEntry[] = [
			{ name: 'quantized-large', details: { parameter_size: '14B' }, size: 3_000_000_000, capability: 'tools' },
			{ name: 'normal-small', details: { parameter_size: '7B' }, size: 5_000_000_000, capability: 'tools' },
			{ name: 'unknown-count', size: 4_000_000_000, capability: 'tools' }
		];
		assert.equal(choose('auto:quality', 'chat', 'hi', mixed).model, 'quantized-large');
        const allUnknown: ModelCatalogEntry[] = [{ name: 'z', capability: 'tools' }, { name: 'a', capability: 'tools' }];
        assert.match(choose('auto:quality', 'agent', 'hi', allUnknown).reason, /sizes are unavailable/);
    });

    it('only retries model-load failures rather than arbitrary tool and user errors', () => {
        assert.equal(isRecoverableModelError(new Error('Ollama request failed (503): busy')), true);
        assert.equal(isRecoverableModelError(new Error('model does not support tools')), true);
        assert.equal(isRecoverableModelError(new Error('Ollama request failed (401): unauthorized')), false);
        assert.equal(isRecoverableModelError(new Error('User rejected a write')), false);
        assert.equal(isRecoverableModelError(new Error('Ollama request cancelled.')), false);
    });

    it('switches to another eligible installed model before output', async () => {
        const attempts: string[] = [];
        const selected: string[] = [];
        const result = await runWithModelFallback(choose('auto:balanced', 'agent'), new AbortController().signal,
            async model => {
                attempts.push(model);
                if (model === 'medium') throw new Error('Ollama request failed (503): model unavailable');
                return 'finished';
            }, (model, reason) => { selected.push(`${model}: ${reason}`); });
        assert.deepEqual(attempts, ['medium', 'large']);
        assert.match(result.reason, /Fallback from medium/);
        assert.equal(result.result, 'finished');
        assert.equal(selected.length, 2);
    });

    it('does not replay after streaming, tool activity, cancellation or manual choice', async () => {
        for (const selected of ['auto:balanced', 'medium']) {
            const attempts: string[] = [];
            await assert.rejects(runWithModelFallback(choose(selected, 'agent'), new AbortController().signal,
                async (model, markStarted) => {
                    attempts.push(model);
                    markStarted();
                    throw new Error('Ollama request failed (503): model unavailable');
                }, () => {}), /503/);
            assert.deepEqual(attempts, ['medium']);
        }
        const aborted = new AbortController();
        aborted.abort();
        await assert.rejects(runWithModelFallback(choose('auto:balanced'), aborted.signal,
            async () => 'never', () => {}), /aborted/);
    });

    it('does not retry unrelated tool errors or manual model failures', async () => {
        let attempts = 0;
        await assert.rejects(runWithModelFallback(choose('auto:balanced'), new AbortController().signal,
            async () => { attempts++; throw new Error('Rejected by user'); }, () => {}), /Rejected/);
        assert.equal(attempts, 1);
    });
});
