import type { LandingCounters } from './handover-landing.types.ts'

/** A repository whose worktree holds one commit hook and whose branch `feat/x` holds another, not merged. */
export type HookTreeRepository = {
	root: string
	/** The branch tip. */
	tip: string
	/** The tree git's trial merge of the tip into the worktree leaves. */
	mergedTree: string
	/** The worktree's own tree (HEAD's, the working files clean). */
	ownTree: string
	/** The commit hook hash of the worktree's hook files, and of the merged tree's. */
	worktreeHookHash: string
	mergedHookHash: string
}

/** A hand-over of a gated code lot then a merge lot of a main whose hook is not the worktree's. */
export type HookTreeScenario = {
	root: string
	out: string
	counters: LandingCounters
	/** The tree the code lot commits, which the merge lot starts from. */
	lotTree: string
}
