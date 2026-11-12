import { commitOf } from './rule-gaps-base-branch.ts'
/** Scratch repositories whose target branch moves past a hand-over: the hand-over's lots file, a branch moved by commits. */
import {
	FEATURE_BRANCH,
	FIRST_LOT_FILE,
	FIRST_LOT_MESSAGE,
	LOT_FILE_TEXT,
	MERGE_LOT_MESSAGE,
	MOVE_MESSAGE,
	SECOND_LOT_FILE,
	SECOND_LOT_MESSAGE,
} from './rule-gaps-target-moved.constants.ts'
import { createScratchRepository, git, writeFiles } from './scratch-repository.ts'

import type { LotsFile, MergeLotPlan } from '../src/lib/handover/handover.types.ts'
import type { TargetScenario } from './rule-gaps-target-moved.types.ts'

/**
 * A repository on `main` and a branch `feat/x` cut from it, checked out: the lots file of a hand-over of two plain
 * lots (nothing committed) whose `head` is the commit both start at.
 */
export function targetScenario(): TargetScenario {
	const root = createScratchRepository()
	const start = commitOf({ root, rev: 'HEAD' })
	git({ root, args: ['switch', '-q', '-c', FEATURE_BRANCH] })
	const lotsFile: LotsFile = {
		repository: root,
		branch: FEATURE_BRANCH,
		head: start,
		lots: [
			{ paths: [FIRST_LOT_FILE], message: FIRST_LOT_MESSAGE },
			{ paths: [SECOND_LOT_FILE], message: SECOND_LOT_MESSAGE },
		],
	}
	return { root, start, lotsFile }
}

/**
 * `branch` moved on by `count` commits (one by default) without touching the checkout or the working tree: each new
 * commit holds its parent's tree. The new tip of the branch.
 */
export function moveBranchTip(params: { root: string; branch: string; count?: number }): string {
	const { root, branch } = params
	for (let moved = 0; moved < (params.count ?? 1); moved++) {
		const tip = commitOf({ root, rev: `refs/heads/${branch}` })
		const next = git({
			root,
			args: ['commit-tree', `${tip}^{tree}`, '-p', tip, '-m', MOVE_MESSAGE],
		}).trim()
		git({ root, args: ['update-ref', `refs/heads/${branch}`, next] })
	}
	return commitOf({ root, rev: `refs/heads/${branch}` })
}

/** Commits one plain lot of the lots file (its file written, then added and committed with the lot's message) on the current branch. */
export function commitPlainLot(params: { root: string; lot: 'first' | 'second' }): void {
	const first = params.lot === 'first'
	writeFiles({
		root: params.root,
		files: { [first ? FIRST_LOT_FILE : SECOND_LOT_FILE]: LOT_FILE_TEXT },
	})
	git({ root: params.root, args: ['add', '--', first ? FIRST_LOT_FILE : SECOND_LOT_FILE] })
	git({
		root: params.root,
		args: ['commit', '-q', '-m', first ? FIRST_LOT_MESSAGE : SECOND_LOT_MESSAGE],
	})
}

/** The lots file with one merge lot of `branch` at `tip` in place of its plain lots. */
export function withMergeLot(params: {
	lotsFile: LotsFile
	branch: string
	tip: string
}): LotsFile {
	const mergeLot: MergeLotPlan = {
		kind: 'merge',
		branch: params.branch,
		tip: params.tip,
		resolved: {},
		message: MERGE_LOT_MESSAGE,
	}
	return { ...params.lotsFile, lots: [mergeLot] }
}

/** The commit of a merge of `branch` into the current branch (a merge commit, even when it could fast-forward). */
export function mergeBranchHere(params: { root: string; branch: string }): string {
	git({
		root: params.root,
		args: ['merge', '-q', '--no-ff', '-m', 'merge: the branch', params.branch],
	})
	return commitOf({ root: params.root, rev: 'HEAD' })
}
