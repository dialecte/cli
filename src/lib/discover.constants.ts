import ts from 'typescript'

/**
 * Inside the package, so its imports resolve; under node_modules, so no formatter, linter or git sees it.
 * The process id keeps two commands running at once in one package from sharing a file.
 */
export const ENTRY_FOLDER = 'node_modules/.cache/dialecte'

/** The roots a method hangs from: a read on `q` (`doc.query`), a write on `tx`, the document, the project. */
export const ROOTS = ['q', 'tx', 'doc', 'project'] as const

export const PRIMITIVE_LIKE =
	ts.TypeFlags.StringLike |
	ts.TypeFlags.NumberLike |
	ts.TypeFlags.BooleanLike |
	ts.TypeFlags.ESSymbolLike |
	ts.TypeFlags.VoidLike |
	ts.TypeFlags.Null |
	ts.TypeFlags.BigIntLike

/** Signatures as a reader writes them: arrow style, aliases kept, long types cut by the checker's own limit. */
export const SIGNATURE_FORMAT =
	ts.TypeFormatFlags.WriteArrowStyleSignature |
	ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope

/** The first markdown code block of an `@example`: group 1 is its code. */
export const FENCED_CODE_PATTERN = /^[ \t]*```[a-z]*[ \t]*\n([\s\S]*?)^[ \t]*```/m

/** Prints the types a signature writes, without their comments. */
export const SIGNATURE_PRINTER = ts.createPrinter({ removeComments: true })
