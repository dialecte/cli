/** A base the one order found: the commit, and the line that names its short sha and where it came from. */
export type FoundBaseLine = {
	/** The commit the one base order found. */
	base: string
	/** The line a run prints: the short commit and its source. */
	line: string
}

/** No base, because the lot base of the worktree's lot cannot be read: the line that says why. */
export type NoBaseLine = {
	/** No commit: the reader tells the two apart by it. */
	base?: never
	/** `rules: no base (<why>)`. */
	line: string
}

/** The base a run without a gate base is judged against, with its line, or the line saying why there is none. */
export type BaseWithLine = FoundBaseLine | NoBaseLine
