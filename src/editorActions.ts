import { getEditorReplacementRange } from './editorRange';

type TextDocumentLike<TPosition> = {
	getText(): string;
	offsetAt(position: TPosition): number;
	positionAt(offset: number): TPosition;
};

type SelectionLike<TPosition> = {
	isEmpty: boolean;
	start: TPosition;
	end: TPosition;
};

export async function replaceEditorText<TPosition, TRange>(
	document: TextDocumentLike<TPosition>,
	selection: SelectionLike<TPosition>,
	createRange: (start: TPosition, end: TPosition) => TRange,
	edit: (range: TRange, text: string) => PromiseLike<boolean>,
	text: string
): Promise<void> {
	const offsets = getEditorReplacementRange(
		document.getText().length,
		selection.isEmpty
			? undefined
			: { start: document.offsetAt(selection.start), end: document.offsetAt(selection.end) }
	);
	const range = createRange(
		document.positionAt(offsets.start),
		document.positionAt(offsets.end)
	);
	const applied = await edit(range, text);
	if (!applied) {
		throw new Error('VS Code could not apply the response to the active editor.');
	}
}
