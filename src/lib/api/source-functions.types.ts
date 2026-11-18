import type { ApiJson, ApiSourceFunction } from './api-json.types.ts'
import type { parseSourceFile } from './source-file-functions.ts'
import type ts from 'typescript'

/** What one source file holds: its exported functions, and why it was left out when it could not be parsed. */
export type ParsedSourceFile = {
	entries: ApiSourceFunction[]
	/** What the base-aware rules read of the file; absent when it could not be parsed. */
	facts?: FileFacts
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
	files: Record<
		string,
		{ hash: string; entries: ApiSourceFunction[]; facts?: FileFacts; note?: string }
	>
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

/** The keys a function reads, syntactically: the elements it names, the attributes it reads, the named sets it reads through. */
export type ReadKeys = {
	/** Tag names: a string literal compared with or passed as a tag, or a string-literal type argument. */
	elements: string[]
	/** Attribute names read through `getAttribute`, `readAttribute(s)`, or an `attributes`-named binding. */
	attributes: string[]
	/** A constant of names read through when it is no list of string literals of the file: its name. */
	namedSets: string[]
}

/** A call a function makes by name: the name, and the specifier it is imported from when it is imported. */
export type CallFacts = { name: string; specifier?: string }

/** One top-level function of a file, path-free: what the base-aware rules compare. */
export type FunctionFacts = {
	name: string
	/** The line it is declared at, 1-based. */
	line: number
	/** The names it is exported by; none for a function of the file only. */
	exportedAs: string[]
	summary?: string
	/** The tokens of its type parameters, parameters and return annotation, hashed: formatting and comments ignored. */
	signatureHash: string
	/** The tokens of its body, hashed: formatting and comments ignored. */
	bodyHash: string
	/** How many tokens its body holds: a body too small to tell two functions apart is never matched by its hash alone. */
	bodyTokenCount: number
	/** The type names its parameters and return annotation reference: a change of one of them is a change of its signature. */
	signatureTypes: string[]
	readKeys: ReadKeys
	calls: CallFacts[]
}

/** A static import or re-export of a file: the specifier, the names it binds (imported as local), and whether it re-exports. */
export type ImportFacts = {
	specifier: string
	/** The line the import or re-export is written at, 1-based. */
	line: number
	names: { imported: string; local: string }[]
	reexport: boolean
	/** `export * from` or `import * as`: every name of the module. */
	all?: true
}

/** A type alias or interface a file declares: its name and its tokens hashed. */
export type TypeFacts = { name: string; hash: string }

/** What the base-aware rules read of one source file, path-free: its functions, imports and types. */
export type FileFacts = {
	functions: FunctionFacts[]
	imports: ImportFacts[]
	types: TypeFacts[]
}
