import type ts from 'typescript'

/** A git argument list a call reaches, with the expression the call writes for it: the list itself, or a reference. */
export type WrittenList = {
	/** What the call writes: the list when written there, else the reference to a same-file const holding it. */
	written: ts.Expression
	list: ts.ArrayLiteralExpression
}
