/**
 * A one-call example of a method, taken from the test written next to its declaration (`of.ts` →
 * `of.test.ts`): a call of the function with no test scaffolding in its arguments, literal arguments first,
 * then the shortest, written on the route a caller uses, the query or transaction argument dropped since the
 * route binds it. No such call, no example. The tests are not in the published package, so
 * the example is inlined into `api.json` at generate time.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	EXAMPLE_MAX_LENGTH,
	FIXTURE_CONSTANT_PATTERN,
	SCAFFOLDING_IDENTIFIERS,
} from './api-json.constants.ts'

import ts from 'typescript'

export function findTestExample(params: {
	root: string
	/** `src/info/of.ts:120`: the file and position discover recorded. */
	declaredAt: string
	/** The route the example is written on: `doc.query.info.of`. */
	route: string
}): string | undefined {
	const { file, position } = splitDeclaredAt(params.declaredAt)
	const testFile = join(params.root, file.replace(/\.ts$/, '.test.ts'))
	if (!file.endsWith('.ts') || !existsSync(testFile)) return undefined
	const functionName = declaredName({ path: join(params.root, file), position })
	if (!functionName) return undefined

	const source = ts.createSourceFile(
		testFile,
		readFileSync(testFile, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
	)
	const examples: { text: string; literal: boolean }[] = []
	visit(source)
	return examples
		.filter((example) => example.text.length <= EXAMPLE_MAX_LENGTH)
		.sort(
			(left, right) =>
				Number(right.literal) - Number(left.literal) ||
				left.text.length - right.text.length ||
				(left.text < right.text ? -1 : 1),
		)[0]?.text

	function visit(node: ts.Node): void {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === functionName
		) {
			const example = exampleOf({ call: node, source, route: params.route })
			if (example) examples.push(example)
		}
		ts.forEachChild(node, visit)
	}
}

/** `file:position` → its parts; the position is a character offset. */
export function splitDeclaredAt(declaredAt: string): { file: string; position: number } {
	const separator = declaredAt.lastIndexOf(':')
	return {
		file: declaredAt.slice(0, separator),
		position: Number(declaredAt.slice(separator + 1)),
	}
}

/** The name of the function declared at the position: the identifier the tests call. */
function declaredName(params: { path: string; position: number }): string | undefined {
	if (!existsSync(params.path)) return undefined
	const source = ts.createSourceFile(
		params.path,
		readFileSync(params.path, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
	)
	let name: string | undefined
	source.forEachChild(function find(node: ts.Node): void {
		if (name !== undefined) return
		if (node.getStart(source) === params.position && hasName(node)) name = node.name.text
		else if (node.pos <= params.position && params.position < node.end) node.forEachChild(find)
	})
	return name
}

function hasName(node: ts.Node): node is ts.Node & { name: ts.Identifier } {
	return (
		(ts.isFunctionDeclaration(node) ||
			ts.isVariableDeclaration(node) ||
			ts.isMethodDeclaration(node)) &&
		node.name !== undefined &&
		ts.isIdentifier(node.name)
	)
}

/**
 * The call on the route, its first argument (the query or transaction) dropped, as the test writes it; undefined
 * when an argument is test scaffolding (a test case field, a fixture constant, a cast) or spans several lines.
 */
function exampleOf(params: {
	call: ts.CallExpression
	source: ts.SourceFile
	route: string
}): { text: string; literal: boolean } | undefined {
	const { call, source } = params
	const callArguments = call.arguments.slice(1)
	const texts = callArguments.map((argument) => argument.getText(source))
	if (texts.some((text) => text.includes('\n')) || callArguments.some(isScaffolding))
		return undefined
	const awaited = ts.isAwaitExpression(call.parent) ? 'await ' : ''
	return {
		text: `${awaited}${params.route}(${texts.join(', ')})`,
		literal: callArguments.every(isLiteral),
	}
}

/** Something only a test holds: a field of its table case, a fixture constant, a cast to silence the types. */
function isScaffolding(node: ts.Node): boolean {
	if (
		ts.isAsExpression(node) ||
		ts.isTypeAssertionExpression(node) ||
		ts.isNonNullExpression(node) ||
		ts.isSatisfiesExpression(node)
	)
		return true
	if (
		ts.isIdentifier(node) &&
		(SCAFFOLDING_IDENTIFIERS.includes(node.text) || FIXTURE_CONSTANT_PATTERN.test(node.text))
	)
		return true
	return ts.forEachChild(node, isScaffolding) === true
}

/** A value written out: strings, numbers, booleans, and objects or arrays of them. */
function isLiteral(node: ts.Node): boolean {
	if (
		ts.isStringLiteral(node) ||
		ts.isNoSubstitutionTemplateLiteral(node) ||
		ts.isNumericLiteral(node) ||
		node.kind === ts.SyntaxKind.TrueKeyword ||
		node.kind === ts.SyntaxKind.FalseKeyword ||
		node.kind === ts.SyntaxKind.NullKeyword
	)
		return true
	if (ts.isArrayLiteralExpression(node)) return node.elements.every(isLiteral)
	if (ts.isObjectLiteralExpression(node))
		return node.properties.every(
			(property) => ts.isPropertyAssignment(property) && isLiteral(property.initializer),
		)
	return false
}
