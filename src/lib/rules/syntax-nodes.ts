/** Small readers of a TypeScript syntax tree the quality rules share. */
import ts from 'typescript'

/** The expression under parentheses, `!` and type assertions. */
export function unwrapped(expression: ts.Expression): ts.Expression {
	if (
		ts.isParenthesizedExpression(expression) ||
		ts.isNonNullExpression(expression) ||
		ts.isAsExpression(expression) ||
		ts.isSatisfiesExpression(expression) ||
		ts.isTypeAssertionExpression(expression)
	)
		return unwrapped(expression.expression)
	return expression
}

/** A function with parameters and a body: declaration, method, accessor, constructor, expression, arrow. */
export function isFunctionNode(node: ts.Node): node is ts.FunctionLikeDeclaration {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node) ||
		ts.isConstructorDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node)
	)
}

/** The 1-based line and column of the first token of `node`. */
export function positionOf(params: { node: ts.Node; sourceFile: ts.SourceFile }): {
	line: number
	column: number
} {
	const { node, sourceFile } = params
	const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
	return { line: position.line + 1, column: position.character + 1 }
}

/** The direct children of `node`, in source order. */
export function childNodesOf(node: ts.Node): ts.Node[] {
	const children: ts.Node[] = []
	ts.forEachChild(node, (child) => {
		children.push(child)
	})
	return children
}

/** Every name a binding introduces: the name, or each name a destructuring pattern binds (holes left out). */
export function bindingNamesOf(name: ts.BindingName): string[] {
	if (ts.isIdentifier(name)) return [name.text]
	return name.elements.flatMap((element) =>
		ts.isBindingElement(element) ? bindingNamesOf(element.name) : [],
	)
}
