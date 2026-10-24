import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { replaceEditorText } from '../src/editorActions';

type MockRange = { start: number; end: number };

function createDocument(text: string) {
	return {
		getText: () => text,
		offsetAt: (position: number) => position,
		positionAt: (offset: number) => offset
	};
}

describe('replaceEditorText', () => {
	it('replaces the entire active document when the selection is empty', async () => {
		const calls: Array<{ range: MockRange; text: string }> = [];
		await replaceEditorText(
			createDocument('existing contents'),
			{ isEmpty: true, start: 4, end: 4 },
			(start, end) => ({ start, end }),
			async (range, text) => {
				calls.push({ range, text });
				return true;
			},
			'generated contents'
		);

		assert.deepEqual(calls, [{ range: { start: 0, end: 17 }, text: 'generated contents' }]);
	});

	it('replaces only the selected editor range', async () => {
		const calls: Array<{ range: MockRange; text: string }> = [];
		await replaceEditorText(
			createDocument('replace this only'),
			{ isEmpty: false, start: 8, end: 12 },
			(start, end) => ({ start, end }),
			async (range, text) => {
				calls.push({ range, text });
				return true;
			},
			'that'
		);

		assert.deepEqual(calls, [{ range: { start: 8, end: 12 }, text: 'that' }]);
	});

	it('reports a failed VS Code edit rather than reporting success', async () => {
		await assert.rejects(
			replaceEditorText(
				createDocument('contents'),
				{ isEmpty: true, start: 0, end: 0 },
				(start, end) => ({ start, end }),
				async () => false,
				'generated'
			),
			/VS Code could not apply the response/
		);
	});
});
