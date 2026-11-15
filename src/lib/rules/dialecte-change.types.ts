import type ts from 'typescript'

/** The kinds of package the Dialecte-change scope tells apart. */
export type PackageKind = 'core' | 'dialecte' | 'create' | 'cli' | 'app'

/** The rule that took a file as a Dialecte change, or left it out (`file-kind`, `cli`, `none`). */
export type DialecteChangeRule =
	| 'package-source'
	| 'template'
	| 'import'
	| 'own-import'
	| 'cli'
	| 'file-kind'
	| 'none'

/** Whether a file is a Dialecte change, and the rule that decided it. */
export type DialecteChangeVerdict = { dialecteChange: boolean; rule: DialecteChangeRule }

/**
 * One package's reader: its kind, and the verdict of any file of it (resolutions cached per reader). A caller that
 * already parsed the file hands its `sourceFile`, so the file is never parsed twice.
 */
export type DialecteChangeReader = {
	kind: PackageKind
	verdictOf(params: { file: string; sourceFile?: ts.SourceFile }): DialecteChangeVerdict
}

/** A module a file imports or re-exports, and whether that brings a value (not only types). */
export type ModuleReference = { specifier: string; value: boolean; reexport: boolean }

/** A checked file with its verdict, as `rules --json` lists it. */
export type DialecteChangeEntry = {
	file: string
	dialecteChange: boolean
	rule: DialecteChangeRule
}

/** What the verdict of a file reads through its reader: the package, and the answers kept for the run. */
export type DialecteChangeContext = {
	root: string
	kind: PackageKind
	/** Whether a specifier names `@dialecte/core` or an installed dialecte (its `dist` holds a definition). */
	importsDialecte(specifier: string): boolean
	/** The value imports and re-exports of a file of the package. */
	valueReferencesOf(file: string): ModuleReference[]
	/** The file of the package a specifier names, from the importing file; undefined when none. */
	localFileOf(params: { from: string; specifier: string }): string | undefined
	/** The file's syntax tree, read once for the run; undefined for a file that cannot be read. */
	sourceOf(file: string): ts.SourceFile | undefined
}
