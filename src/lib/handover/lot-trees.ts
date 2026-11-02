/**
 * The tree each lot of a hand-over will commit, before any commit: HEAD's tree, then each lot on top as
 * `trial-base.ts` builds it - a plain lot's files as they are in the working tree, a merge lot's trial merge
 * with its resolutions. Nothing in the repository changes (git objects no ref points to).
 */
import { trialMerge } from './merge-lot.ts'
import { addMerge, addWorkingFiles, readHeadBase } from './trial-base.ts'

import type { LotTree, ResolvedLot, TrialBase } from './handover.types.ts'

/** Per lot, in order: the tree it starts from and the tree its commit will hold. */
export function listLotTrees(params: { root: string; lots: readonly ResolvedLot[] }): LotTree[] {
	const { root } = params
	let base: TrialBase = readHeadBase(root)
	return params.lots.map(function lotTree(lot): LotTree {
		const before = base.tree
		if (lot.merge) {
			const { tip, resolutions } = lot.merge
			const trial = trialMerge({ root, base: base.commit, tip })
			base = addMerge({ root, base, tip, tree: trial.tree, resolutions })
		} else base = addWorkingFiles({ root, base, files: [...lot.files, ...lot.deletedFiles] })
		return { before, tree: base.tree }
	})
}
