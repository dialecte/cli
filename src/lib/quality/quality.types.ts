import type { FileFacts, FunctionFacts } from '../api/source-functions.types.ts'

/** A path the change touches since the base, relative to the package root, as the presence map holds it. */
export type ChangedPath =
	| { path: string; state: 'added' | 'modified' | 'deleted' }
	| { path: string; state: 'renamed'; from: string }

/** The facts of both sides of a change: every implementation file of the tree, and the base side of the changed ones. */
export type ChangeFacts = {
	changed: ChangedPath[]
	/** Every implementation file of the tree, by path. */
	tree: ReadonlyMap<string, FileFacts>
	/** The base side of each changed, renamed-from or deleted path the base held, by its base path. */
	base: ReadonlyMap<string, FileFacts>
}

/** One function of a side, with the file it is in. */
export type SidedFunction = { file: string; facts: FunctionFacts }

/**
 * The functions of a change: new (added, or its read keys changed) and existing (the same as a base function, its keys
 * changed or not: a function whose keys changed is on both sides and never compared with itself).
 */
export type FunctionSides = { added: SidedFunction[]; existing: SidedFunction[] }

/** The file a specifier names from a file of the package; undefined when none (a dependency, unresolved). */
export type ResolveSpecifier = (request: { from: string; specifier: string }) => string | undefined

/** A `duplicate-read` finding: the new function, the signal, and the existing function it reads like. */
export type DuplicateRead = {
	file: string
	line: number
	name: string
	signal: 'reads' | 'find'
	existing: { file: string; line: number; name: string }
	/** The element and attributes both read (signal `reads`). */
	element?: string
	attributes?: string[]
}
