/** A hand-over whose one lot merges `main` at the tip main had when it was written, main moved on afterwards by the cases. */
import { writeStoreHandover } from './handover-store-scenario.ts'
import { FEATURE_FILE, FEATURE_TEXT, MERGE_MESSAGE } from './rule-gaps-target-moved.constants.ts'
import { moveBranchTip } from './rule-gaps-target-moved.ts'
import { createScratchRepository, git, writeFiles } from './scratch-repository.ts'

import type { MergeLotPlan } from '../src/lib/handover/handover.types.ts'

/**
 * A repository whose branch `feat/handover-show` holds one commit past `main`, `main` moved one commit, and the
 * hand-over of one merge lot of `main` at that tip (its tree recorded); main is not moved past it yet.
 */
export function mergeMainHandover(params: { branch?: string } = {}): {
	root: string
	folder: string
	mergedTip: string
} {
	const branch = params.branch ?? 'main'
	const root = createScratchRepository()
	git({ root, args: ['switch', '-q', '-c', 'feat/handover-show'] })
	writeFiles({ root, files: { [FEATURE_FILE]: FEATURE_TEXT } })
	git({ root, args: ['add', '--', FEATURE_FILE] })
	git({ root, args: ['commit', '-q', '-m', 'feat: the branch work'] })
	// a branch other than main starts where main is, and moves once
	if (branch !== 'main') git({ root, args: ['branch', '-q', branch, 'main'] })
	const mergedTip = moveBranchTip({ root, branch })
	const tree = git({ root, args: ['merge-tree', '--write-tree', 'HEAD', mergedTip] })
		.split('\n')[0]
		.trim()
	const mergeLot: MergeLotPlan = {
		kind: 'merge',
		branch,
		tip: mergedTip,
		resolved: {},
		message: MERGE_MESSAGE,
		tree,
	}
	const { folder } = writeStoreHandover({ root, name: 'merge-main', lots: [mergeLot] })
	return { root, folder, mergedTip }
}
