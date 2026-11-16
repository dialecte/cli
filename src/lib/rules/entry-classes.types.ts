/** By package file (a path from the root, `/` separators): the names of its classes a package entry exports. */
export type EntryClasses = ReadonlyMap<string, ReadonlySet<string>>

/** One name asked of one module while walking from the entries: `*` asks every name it exports. */
export type ExportRequest = { file: string; name: string }

/** What a module-level name is to the walk: a class of the module, or a name imported from another module. */
export type ModuleName =
	| { kind: 'class'; name: string }
	| { kind: 'import'; specifier: string; name: string }
