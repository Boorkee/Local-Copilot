import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getEditorReplacementRange } from '../src/editorRange';

describe('getEditorReplacementRange', () => {
	it('replaces the complete document when there is no selection', () => {
		assert.deepEqual(getEditorReplacementRange(18), { start: 0, end: 18 });
	});

	it('replaces the complete document for an empty selection', () => {
		assert.deepEqual(getEditorReplacementRange(18, { start: 4, end: 4 }), { start: 0, end: 18 });
	});

	it('preserves the selected range when text is selected', () => {
		assert.deepEqual(getEditorReplacementRange(18, { start: 4, end: 12 }), { start: 4, end: 12 });
	});

	it('supports replacing an empty document', () => {
		assert.deepEqual(getEditorReplacementRange(0), { start: 0, end: 0 });
	});
});
