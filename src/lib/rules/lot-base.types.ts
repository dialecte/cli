/** The base a lot's worktree is judged against when no gate hands one: the commit, and the line that says where it came from. */
export type LotBase = {
	/** The merge-base of HEAD and the base ref. */
	base: string
	/** The line a run prints: the short commit and its source. */
	line: string
}
