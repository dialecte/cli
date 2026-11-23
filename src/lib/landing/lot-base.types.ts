import type { LandingState } from './landing-state.types.ts'

/** The lot a stacked lot was started on: its branch and its landing state (`readLandingState`). */
export type StackParent = {
	branch: string
	landing: LandingState
}

/** What a lot's base is read from. */
export type LotBaseQuery = {
	/** The repository (any of its worktrees). */
	root: string
	/** The lot's tip: its branch ref or its worktree's HEAD commit. */
	head: string
	/** The ref the repository's lots land on, as fetched: `refs/remotes/origin/<base>`. */
	baseRef: string
	/** The lot it was started on; left out for a lot cut from the base. */
	parent?: StackParent
}

/**
 * A lot's base: the ref it lands on now (the base, or an open parent's newest branch tip), how lines name it, and the
 * fork point (the newest commit of that line the lot holds): what a rebase moves is the lot's commits after it.
 */
export type LotBase = {
	ref: string
	label: string
	forkPoint: string
	/**
	 * The commits a joined base joins, in order (the parent's line, then the base), when the lot holds lines none of
	 * which holds the others (a merge of the base branch): `forkPoint` is then a commit no ref names, whose parents they
	 * are. Absent for a single fork point.
	 */
	joined?: readonly string[]
}

/** A commit a lot's line forks at, with the label of that line (the parent's branch, or the base). */
export type LotLineFork = { commit: string; label: string }
