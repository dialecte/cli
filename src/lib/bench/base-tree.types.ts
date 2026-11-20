/** The base tree the bench measures: the package exported at the base commit, and the links made beside it. */
export type BaseTree = {
	/** The exported package folder, inside its scratch folder. */
	folder: string
	/** The links made for it (its siblings beside it, its `node_modules`), unlinked first when it is removed. */
	links: string[]
}
