/** The base a run without a gate base is judged against: the commit, and the line that says where it came from. */
export type BaseWithLine = {
	/** The commit the one base order found. */
	base: string
	/** The line a run prints: the short commit and its source. */
	line: string
}
