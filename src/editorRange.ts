export type OffsetRange = {
	start: number;
	end: number;
};

export function getEditorReplacementRange(documentLength: number, selection?: OffsetRange): OffsetRange {
	if (selection && selection.start !== selection.end) {
		return selection;
	}
	return { start: 0, end: documentLength };
}
