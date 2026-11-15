import type { UnitContext } from './check-code-rules.types.ts'
import type ts from 'typescript'

/** What a package's own file is to a test that imports it: the code under test, or test support. */
export type OwnImportKind = 'unit' | 'test-support'

/** One run's reader of a test file's imports (the resolutions, trees and kinds kept for the run). */
export type UnitContextReader = {
	unitsOf(params: { file: string; sourceFile: ts.SourceFile }): UnitContext
	/** The names the file imports that are a `const` XML literal in their module (one level). */
	xmlImportsOf(params: { file: string; sourceFile: ts.SourceFile }): ReadonlySet<string>
	/** The package files of the `.xml?raw` fixtures the file imports, as paths from the package root. */
	rawFixturesOf(params: { file: string; sourceFile: ts.SourceFile }): string[]
}

/** A name a file value-imports: its local name, the name its module exports it under, and the module. */
export type ValueImport = { name: string; imported: string; specifier: string }
