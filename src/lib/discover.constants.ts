import ts from 'typescript'

/**
 * Inside the package, so its imports resolve; under node_modules, so no formatter, linter or git sees it.
 * The process id keeps two commands running at once in one package from sharing a file.
 */
export const ENTRY_FOLDER = 'node_modules/.cache/dialecte'

export const ROOTS: readonly string[] = ['q', 'tx', 'doc', 'project']

export const PRIMITIVE_LIKE =
	ts.TypeFlags.StringLike |
	ts.TypeFlags.NumberLike |
	ts.TypeFlags.BooleanLike |
	ts.TypeFlags.ESSymbolLike |
	ts.TypeFlags.VoidLike |
	ts.TypeFlags.Null |
	ts.TypeFlags.BigIntLike
