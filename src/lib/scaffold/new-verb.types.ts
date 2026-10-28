import type { VERB_KINDS } from './new-verb.constants.ts'

export type VerbKind = (typeof VERB_KINDS)[number]

export type NewVerbParams = {
	/** The package root. */
	root: string
	/** `v2019C1`: the version folder under `src/`. */
	version: string
	/** The dialecte's namespace: `Scl`. */
	dialecteName: string
	/** The extension namespace, camelCase: `info`, `cleanUp`. */
	namespace: string
	kind: VerbKind
	/** The verb, camelCase: `ofEach`. */
	name: string
}

/** Files written and edited, relative to the package root. */
export type NewVerbResult = {
	written: string[]
	edited: string[]
}

/** What the files of a verb are written from. */
export type VerbNames = Pick<
	NewVerbParams,
	'version' | 'dialecteName' | 'namespace' | 'kind' | 'name'
> & {
	/** `find-orphans` */
	file: string
	/** `Root`, or a placeholder when the definition does not name it. */
	rootElement: string
}
