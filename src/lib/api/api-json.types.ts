import type { ROOTS } from '../discover.constants.ts'

/** The root a method hangs from: a read on `doc.query`, a write on `tx`, the document or the project. */
export type MethodRoot = (typeof ROOTS)[number]

/**
 * One method of a package as `api.json` ships it: what `dialecte api find` and `api show` read. A method of a
 * root or a function a package entry exports: `root` tells them apart, and only an export has an `entry`.
 */
export type ApiMethod = ApiRootMethod | ApiExportedFunction

/** A method reached from a root (`q`, `tx`, `doc`, `project`). */
export type ApiRootMethod = ApiMethodFields & {
	root: MethodRoot
	entry?: undefined
}

/** A function a package entry exports on its own (`@dialecte/core/sqlite.connectHub`). */
export type ApiExportedFunction = ApiMethodFields & {
	root: 'export'
	/** The package entry the function comes from ('@dialecte/core/sqlite'). */
	entry: string
}

/** What every row of `api.json` holds, whatever its root. */
export type ApiMethodFields = {
	/** The canonical route, as a caller writes it: `doc.query.info.of`, `@dialecte/core/sqlite.connectHub`. */
	path: string
	/** The same method reached from other roots. */
	otherRoutes: string[]
	/** As the type checker prints it, the bound query or transaction left out. */
	signature: string
	summary: string | undefined
	intents: string[]
	/** `src/<file>.ts:<line>`, relative to the package. */
	declaredAt: string | undefined
	/** One call, from the JSDoc `@example` or from a test that calls the method. */
	example: string | undefined
}

/** `skills/<name>/references/api.json`: every public method a package defines. */
export type ApiJson = {
	package: string
	methods: ApiMethod[]
}

/** A method found for a need, with the package that ships it and why it matched. */
export type FoundMethod = {
	method: ApiMethod
	packageName: string
	/** How many words of the need its intents, its summary and its name hold: compared in that order. */
	hits: { intent: number; summary: number; name: number }
	/** The intent sharing the most words with the need; undefined when only the summary or the name matched. */
	matchingIntent: string | undefined
}

/** A method of an installed package, with the package that ships it. */
export type PackagedMethod = {
	method: ApiMethod
	packageName: string
}

/** One line of `dialecte members`: a method with its summary, or a group with how many methods it holds. */
export type Member =
	| { kind: 'method'; name: string; summary: string | undefined; intents: string[] }
	| { kind: 'group'; name: string; methodCount: number }
