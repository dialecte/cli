import type { MutationModeSetting, OwnerCheck } from './mutation.types.ts'

/** How the hand-over's `mutation` line reads: `failed` blocks the card and the guard, `warning` does not. */
export type PendingVerdictStatus = 'passed' | 'warning' | 'failed'

/** The hand-over's `mutation` verdict: the card prints its status and detail, the guard its lines under them. */
export type PendingVerdict = {
	status: PendingVerdictStatus
	/** The parts joined by ` · `, or `nothing pending`, or the reason a declaration or lot mode is invalid. */
	detail: string
	/** One per `new` survivor and per died run, then what to do with each; empty when there is neither. */
	lines: string[]
}

/** What `pendingVerdict` reads: the package, the hand-over's branches and lot mode, the tree it hands over. */
export type PendingVerdictParams = {
	/** The package root (the hand-over's repository). */
	root: string
	/** The hand-over's branch. */
	branch: string
	/** The branches the hand-over's merge lots merge; empty for a plain hand-over. */
	mergedBranches: readonly string[]
	lotMode: MutationModeSetting
	/**
	 * The tree being handed over (`checkedTree`), or how to compute it: a `gate` lot needs a reported run of the
	 * branch on it. A function is called only for a gate lot, so another lot never pays for a trial merge.
	 */
	tree: string | (() => string)
} & OwnerCheck

/** Where `lotModeOf` looks for the lot's mutation switch: the hand-over folder first, then the package root. */
export type LotModeOfParams = {
	/** The package root: its `.dialecte/lot.json`. */
	root: string
	/** The hand-over folder: its archived lot declaration wins over the root's. */
	folder: string
}
