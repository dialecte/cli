/** A repository with a lot worktree, its round-1 snapshot and the review throwaway made from it. */
export type ThrowawayWorkspace = {
	/** The main checkout, on `main`. */
	repository: string
	/** The lot's worktree, on `lotBranch`. */
	lotWorktree: string
	lotBranch: string
	/** The lot folder holding `round-1/`, `round-1.deleted` and `round-1.base`. */
	lotFolder: string
	/** The throwaway worktree, on `branch`, holding round 1. */
	throwaway: string
	branch: string
	round: number
}
