/** One public method of the q / tx / doc / project surface, with what its JSDoc says about it. */
export type MethodEntry = {
	/** `q.info.of`, `tx.addChild`, `project.open` */
	path: string
	/** First paragraph of the JSDoc, on one line; undefined when the method has none. */
	summary: string | undefined
	/** `@intent` tags, one entry per comma-separated phrase: what a caller is trying to do. */
	intents: string[]
	/** Declared in the package being inspected (not in a dependency such as core). */
	definedInPackage: boolean
	/** Tagged `@internal`: public for TypeScript, not meant for callers (left out of the index). */
	internal: boolean
	/** Where the method is declared (`file:position`): the same method reached by several routes shares it. */
	declaredAt: string | undefined
}

export type DiscoverParams = {
	entrySource: string
	tsconfig: string
	root: string
	/** How many levels of callable groups to walk below q/tx/doc/project (default 1). */
	maxDepth?: number
}
