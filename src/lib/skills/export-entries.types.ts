/** A public entry of a package: one subpath of its `exports` map that ships types. */
export type ExportEntry = {
	/** '@dialecte/core/sqlite' */
	specifier: string
	/** 'src/sqlite.ts', relative to the package */
	source: string
}

/** The fields of `package.json` an entry is read from. */
export type ExportsManifest = {
	name?: unknown
	exports?: unknown
}

/** A declaration file extension and the source extension it is built from ('.d.mts' from '.mts'). */
export type SourceExtension = {
	declaration: string
	source: string
}

/** The declaration file a subpath ships, with the extension it matched. */
export type DeclarationFile = {
	path: string
	extension: SourceExtension
}
