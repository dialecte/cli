/** What the matcher reads of one terminal lot: its name, branch, cut, and the commits that hold its work. */
export type HandMadeLot = {
	lot: string
	branch: string
	cut: string
	/** The lot's landed tip, when its commit is still in the repository. */
	landedTip: string | undefined
}

/** A registered worktree no lot nor hand-over owns, on its own branch: where, and that branch. */
export type CandidateWorktree = { path: string; branch: string }

/** A hand-made throwaway matched to a lot. */
export type HandMadeMatch = { lot: string; path: string; branch: string }
