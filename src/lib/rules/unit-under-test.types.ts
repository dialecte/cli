import type ts from 'typescript'

/** One call of a unit under test in an act: the callee as written, and where the call is. */
export type UnitCall = {
	/** The callee text, `tx.widget.add` or `addWidget`. */
	unit: string
	/** The 1-based line of the call. */
	line: number
	/** The 1-based column of the call. */
	column: number
	/** The call itself. */
	node: ts.CallExpression
	/** Is the call inside a loop body of the act. */
	inLoop: boolean
}
