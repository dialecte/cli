import type ts from 'typescript'

/** The innermost loop around a node: its body runs once per item of `iterated`, when it names one. */
export type LoopContext = {
	node: ts.Node
	/** The iterated expression's text (`nodes`, `params.nodes`); undefined for a `for`, `while` or `do` loop. */
	iterated: string | undefined
}

/** A call of a query read method in a loop body, with the innermost loop it runs in. */
export type QueryRead = {
	call: ts.CallExpression
	method: string
	loop: LoopContext
}
