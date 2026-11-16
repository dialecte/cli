import type ts from 'typescript'

/**
 * Where a value's names are told apart: the constructor's parameters by their declared type or default, its locals by
 * what they hold, the rest by the module's own declarations.
 */
export type ValueContext = {
	sourceFile: ts.SourceFile
	parameters: ReadonlyMap<string, ts.ParameterDeclaration>
	locals: ReadonlyMap<string, ts.Expression>
	/** The names already being judged: a name met again is a cycle, read as data. */
	judging: ReadonlySet<string>
}
