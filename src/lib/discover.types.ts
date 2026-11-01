/** One public method of the q / tx / doc / project surface, with what its JSDoc says about it. */
export type MethodEntry = {
	/** `q.info.of`, `tx.addChild`, `project.open` */
	path: string
	/** First paragraph of the JSDoc, on one line; undefined when the method has none. */
	summary: string | undefined
	/** `@intent` tags, one entry per comma-separated phrase: what a caller is trying to do. */
	intents: string[]
	/** The call signature a caller sees (`(params: { id: string }) => string`), one line per overload. */
	signature: string
	/** The first `@example` of the JSDoc, when it has one. */
	example: string | undefined
	/** Declared in the package being inspected (not in a dependency such as core). */
	definedInPackage: boolean
	/** Tagged `@internal`: public for TypeScript, not meant for callers (left out of the index). */
	internal: boolean
	/** Where the method is declared (`file:position`): the same method reached by several routes shares it. */
	declaredAt: string | undefined
	/** The package entry a standalone export comes from ('@dialecte/core/sqlite'); undefined for a route of q/tx/doc/project. */
	entry?: string
}

export type DiscoverParams = {
	entrySource: string
	tsconfig: string
	root: string
	/** How many levels of callable groups to walk below q/tx/doc/project (default 1). */
	maxDepth?: number
}
