/** What the query names cache file holds: the names, and the key of the index files they were read from. */
export type QueryNamesCache = {
	schema: 1
	key: string
	names: string[]
	/** Core's namespaces of the indexes (`progress`, `perf`), sorted. */
	coreGroups: string[]
}

/** The query read names of a run, and the line to print when `query-in-loop` could not run. */
export type QueryNamesRead = {
	names: ReadonlySet<string>
	/** The first segment past the binding of each core `q` / `tx` path with two or more (`progress`, `perf`). */
	coreGroups: ReadonlySet<string>
	/** `query-in-loop: not run, <file>: <why> (...)`; absent when the indexes were read. */
	note?: string
}
