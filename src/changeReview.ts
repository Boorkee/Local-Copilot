import { WriteProposal } from './workspaceTools';

export type ReviewDecision = 'keep' | 'keepAll' | 'undo';

export type ReviewUi = {
	/** Shows the proposed change (for example as a diff) and resolves with the user's choice. */
	reviewWrite(proposal: WriteProposal): Promise<ReviewDecision>;
	confirmDelete(relativePath: string): Promise<boolean>;
};

/**
 * Creates the approval callbacks for one coding task. "Keep all" only skips
 * further write reviews for that task; deletions are always confirmed.
 */
export function createChangeReviewer(ui: ReviewUi, requireReview: boolean): {
	confirmWrite?: (proposal: WriteProposal) => Promise<boolean>;
	confirmDelete: (relativePath: string) => Promise<boolean>;
} {
	let keepAll = false;
	return {
		confirmWrite: requireReview
			? async proposal => {
				if (keepAll) {
					return true;
				}
				const decision = await ui.reviewWrite(proposal);
				if (decision === 'keepAll') {
					keepAll = true;
				}
				return decision !== 'undo';
			}
			: undefined,
		confirmDelete: relativePath => ui.confirmDelete(relativePath)
	};
}
