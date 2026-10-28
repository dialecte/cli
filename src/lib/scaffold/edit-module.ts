/**
 * Small edits of a module's source through its syntax tree: one import line after the last import, one
 * property at the end of a named object literal. The formatter tidies the result.
 */
import ts from 'typescript'

/** Adds `line` after the last import (or at the top). */
export function addImportLine(params: { source: string; line: string }): string {
	const sourceFile = ts.createSourceFile('module.ts', params.source, ts.ScriptTarget.Latest, true)
	const lastImport = sourceFile.statements.filter(ts.isImportDeclaration).at(-1)
	if (!lastImport) return `${params.line}\n${params.source}`
	const end = lastImport.getEnd()
	return `${params.source.slice(0, end)}\n${params.line}${params.source.slice(end)}`
}

/**
 * Adds `property` (`cleanUp` or `transaction: cleanUpTransactions`) at the end of the object literal
 * assigned to the variable whose name matches; undefined when there is no such object.
 */
export function addObjectProperty(params: {
	source: string
	variableName: RegExp
	property: string
}): string | undefined {
	const sourceFile = ts.createSourceFile('module.ts', params.source, ts.ScriptTarget.Latest, true)
	const object = findObjectLiteral({ node: sourceFile, variableName: params.variableName })
	if (!object) return undefined
	const { properties } = object
	const lastProperty = properties.at(-1)
	if (!lastProperty) {
		const open = object.getStart(sourceFile) + 1
		return `${params.source.slice(0, open)}\n\t${params.property},\n${params.source.slice(open)}`
	}
	const end = properties.hasTrailingComma ? properties.end : lastProperty.getEnd()
	const separator = properties.hasTrailingComma ? '' : ','
	return `${params.source.slice(0, end)}${separator}\n\t${params.property},${params.source.slice(end)}`
}

function findObjectLiteral(params: {
	node: ts.Node
	variableName: RegExp
}): ts.ObjectLiteralExpression | undefined {
	const { node, variableName } = params
	if (
		ts.isVariableDeclaration(node) &&
		ts.isIdentifier(node.name) &&
		variableName.test(node.name.text) &&
		node.initializer &&
		ts.isObjectLiteralExpression(node.initializer)
	)
		return node.initializer
	return ts.forEachChild(node, (child) => findObjectLiteral({ node: child, variableName }))
}
