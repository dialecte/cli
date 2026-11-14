import ts from 'typescript'

/** The name a call is made by: `readdirSync` for `readdirSync(...)` and `fs.readdirSync(...)`; empty for anything else. */
export function calleeName(expression: ts.Expression): string {
	if (ts.isIdentifier(expression)) return expression.text
	if (ts.isPropertyAccessExpression(expression)) return expression.name.text
	return ''
}
