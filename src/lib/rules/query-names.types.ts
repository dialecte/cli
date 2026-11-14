/** What the query names cache file holds: the names, and the key of the index files they were read from. */
export type QueryNamesCache = {
	schema: 1
	key: string
	names: string[]
}

/** The query read names of a run, and the line to print when `query-in-loop` could not run. */
export type QueryNamesRead = {
	names: ReadonlySet<string>
	/** `query-in-loop: not run, <file>: <why> (...)`; absent when the indexes were read. */
	note?: string
}
