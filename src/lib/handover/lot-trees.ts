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

/**
 * The tree the lots still to commit leave: the worktree's, or for lots holding a merge the tree the last lot
 * will leave (the merge's trial tree with its resolutions), which no worktree holds. Git cannot build it (a
 * tip gone): the worktree's, as before a merge. The card checks its gates against it; the run's `mutation`
 * guard looks for a gate lot's mutation run on it.
 * @intent find the tree a hand-over commits, check a record against the handed-over tree
 */
export function checkedTree(params: {
	root: string
	stateTree: string
	lots: readonly ResolvedLot[]
}): string {
	if (!params.lots.some((lot) => lot.merge)) return params.stateTree
	try {
		return listLotTrees({ root: params.root, lots: params.lots }).at(-1)?.tree ?? params.stateTree
	} catch {
		// the guards and the run say what git refused
		return params.stateTree
	}
}

/**
 * The branches the hand-over's merge lots merge, in lot order; empty for a hand-over without a merge lot.
 * @intent list the branches a hand-over merges, read the runs of a merged branch
 */
export function mergedBranchesOf(lots: readonly ResolvedLot[]): string[] {
	return lots.flatMap((lot) => (lot.merge ? [lot.merge.branch] : []))
}
