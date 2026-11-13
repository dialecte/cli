import type { ApiJson, ApiSourceFunction } from './api-json.types.ts'
import type { parseSourceFile } from './source-file-functions.ts'
import type ts from 'typescript'

/** What one source file holds: its exported functions, and why it was left out when it could not be parsed. */
export type ParsedSourceFile = {
	entries: ApiSourceFunction[]
	/** `src/x.ts: not parsed (<reason>)`; undefined when the file parsed. */
	note?: string
}

/** The exported functions of a package's source, sorted by path, with a note for each file or folder not read. */
export type SourceFunctions = {
	entries: ApiSourceFunction[]
	notes: string[]
}

/** The own package's source functions as one more index of `dialecte api`, with the notes of the reader. */
export type SourceIndex = {
	index: ApiJson
	notes: string[]
}

/** The indexes a `--source` lookup searches, the own package's source last, with the notes of the source reader. */
export type SearchedIndexes = {
	indexes: ApiJson[]
	notes: string[]
}

/** The cache file of the source index: what each file held when its bytes had this hash. */
export type SourceIndexCache = {
	schema: number
	/** The version of the cli that wrote it: another version's cache is rebuilt (its parser may answer otherwise). */
	reader?: string
	/** By path from the work tree top (`packages/a/src/x.ts`): the packages of one repository share the cache. */
	files: Record<string, { hash: string; entries: ApiSourceFunction[]; note?: string }>
}

/** The parser of one source file: the default is `parseSourceFile`, a test passes its own to count parses. */
export type ParseSourceFile = typeof parseSourceFile

/** The syntax node whose type parameters, parameters and return annotation make a source function's signature. */
export type SourceFunctionNode = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression

/** A function a source file exports, by the name a caller imports. */
export type ExportedSourceFunction = {
	name: string
	/** The node the signature is printed from: the implementation of an overload set. */
	node: SourceFunctionNode
	/** The node the function is declared at: the first overload, or the declarator of a `const`. */
	declaration: ts.Node
	/** The node whose JSDoc documents the function: the first overload carrying one, or the `const` statement. */
	documented: ts.Node
}

/** A top-level function of a source file, exported or not, before the file's export lists are read. */
export type TopLevelFunction = ExportedSourceFunction & {
	/** It is exported where it is declared (`export function`, `export const`). */
	exported: boolean
}

/** One token of printed code, and whether whitespace came before it. */
export type PrintedToken = {
	kind: ts.SyntaxKind
	text: string
	spaced: boolean
}
