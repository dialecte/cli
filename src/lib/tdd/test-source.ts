import { ASSERTION_CALLEE, CASE_FUNCTIONS, ONLY_MARKER, TEST_FUNCTIONS } from './tdd.constants.ts'

/** Questions about a test file's source, answered from its syntax tree (never from lines or greps). */
import ts from 'typescript'

import type { SourceLocation, TestCall } from './tdd.types.ts'

/**
 * The position is inside an argument of an `expect(...)` (or `expect.soft(...)`) call that asserts: the
 * object of a matcher call (`expect(x).toBe(1)`, `expect(x).not.toBe(1)`, `expect(p).resolves.toBe(1)`).
 * An `expect(x)` without a matcher asserts nothing.
 */
export function isInsideAssertion(params: { text: string; location: SourceLocation }): boolean {
	const source = parseTestSource(params.text)
	const position = positionOf({ source, location: params.location })
	if (position === undefined) return false
	let node: ts.Node | undefined = innermostNodeAt({ source, position })
	for (; node; node = node.parent)
		if (
			ts.isCallExpression(node) &&
			isAssertionCallee(node.expression) &&
			hasMatcher(node) &&
			node.arguments.some(
				(argument) => argument.getStart(source) <= position && position < argument.end,
			)
		)
			return true
	return false
}

/** The names the file imports (default, named and namespace bindings). */
export function importedNames(text: string): Set<string> {
	const names = new Set<string>()
	for (const statement of parseTestSource(text).statements) {
		if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
		const clause = statement.importClause
		if (clause.name) names.add(clause.name.text)
		const bindings = clause.namedBindings
		if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text)
		if (bindings && ts.isNamedImports(bindings))
			for (const element of bindings.elements) names.add(element.name.text)
	}
	return names
}

/**
 * The source of the test call at `location` (`it('name', ...)`, `it.each(table)('name', ...)`): the
 * outermost call starting there; else, as vitest locates an `it.each` case at the parenthesis of the call
 * taking its title, the innermost call whose arguments hold the location; undefined when there is none.
 */
export function testCallTextAt(params: {
	text: string
	location: SourceLocation
}): string | undefined {
	const source = parseTestSource(params.text)
	const start = positionOf({ source, location: params.location })
	if (start === undefined) return undefined
	const position: number = start
	let starting: ts.CallExpression | undefined
	let holding: ts.CallExpression | undefined
	function visit(node: ts.Node): void {
		if (node.getStart(source) > position || node.end <= position) return
		if (ts.isCallExpression(node) && node.getStart(source) === position) {
			if (!starting || node.end > starting.end) starting = node
		} else if (ts.isCallExpression(node) && node.expression.end <= position) holding = node
		ts.forEachChild(node, visit)
	}
	visit(source)
	return (starting ?? holding)?.getText(source)
}

function parseTestSource(text: string): ts.SourceFile {
	return ts.createSourceFile('test.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function positionOf(params: {
	source: ts.SourceFile
	location: SourceLocation
}): number | undefined {
	const { source, location } = params
	if (location.line < 1 || location.line > source.getLineStarts().length) return undefined
	return source.getPositionOfLineAndCharacter(location.line - 1, Math.max(location.column - 1, 0))
}

function innermostNodeAt(params: { source: ts.SourceFile; position: number }): ts.Node {
	const { source, position } = params
	let node: ts.Node = source
	for (;;) {
		const child = node
			.getChildren(source)
			.find((candidate) => candidate.getStart(source) <= position && position < candidate.end)
		if (!child) return node
		node = child
	}
}

/** `expect` or `expect.<method>`. */
function isAssertionCallee(callee: ts.Expression): boolean {
	if (ts.isIdentifier(callee)) return callee.text === ASSERTION_CALLEE
	return (
		ts.isPropertyAccessExpression(callee) &&
		ts.isIdentifier(callee.expression) &&
		callee.expression.text === ASSERTION_CALLEE
	)
}

/** The lines holding a focus marker: `it.only`, `describe.only`, `test.only.each`, a table case `only: true`. */
export function findOnlyMarkers(text: string): number[] {
	const source = parseTestSource(text)
	const lines = new Set<number>()
	function visit(node: ts.Node): void {
		const isOnlyAccess =
			ts.isPropertyAccessExpression(node) &&
			node.name.text === ONLY_MARKER &&
			TEST_FUNCTIONS.includes(rootIdentifierOf(node.expression) ?? '')
		const isOnlyField =
			ts.isPropertyAssignment(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === ONLY_MARKER &&
			node.initializer.kind === ts.SyntaxKind.TrueKeyword
		if (isOnlyAccess || isOnlyField)
			lines.add(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)
		ts.forEachChild(node, visit)
	}
	visit(source)
	return [...lines].sort((left, right) => left - right)
}

/** Every `it` / `test` call of the file, with its title when it is written as a string. */
export function listTestCalls(text: string): TestCall[] {
	const source = parseTestSource(text)
	const calls: TestCall[] = []
	function visit(node: ts.Node): void {
		const takesTitleLater =
			node.parent !== undefined &&
			ts.isCallExpression(node.parent) &&
			node.parent.expression === node
		if (ts.isCallExpression(node) && !takesTitleLater && isTestCallee(node.expression)) {
			const title = node.arguments[0]
			calls.push({
				title: title && ts.isStringLiteralLike(title) ? title.text : undefined,
				text: node.getText(source),
			})
		}
		ts.forEachChild(node, visit)
	}
	visit(source)
	return calls
}

/** `it(...)`, `test.skip(...)`, `it.each(table)(...)`: the call that takes a test's title and body. */
function isTestCallee(callee: ts.Expression): boolean {
	if (ts.isCallExpression(callee)) return isTestCallee(callee.expression) && isEachCall(callee)
	const root = rootIdentifierOf(callee)
	return root !== undefined && CASE_FUNCTIONS.includes(root)
}

function isEachCall(call: ts.CallExpression): boolean {
	return ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'each'
}

/** `it` of `it.skip.each`: the identifier a chain of property accesses starts from. */
function rootIdentifierOf(expression: ts.Expression): string | undefined {
	if (ts.isIdentifier(expression)) return expression.text
	if (ts.isPropertyAccessExpression(expression)) return rootIdentifierOf(expression.expression)
	return undefined
}

/** The `expect(...)` call is the object of a matcher call, through `.not`, `.resolves`, `.rejects`. */
function hasMatcher(expectCall: ts.CallExpression): boolean {
	let node: ts.Node = expectCall
	while (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) {
		const access = node.parent
		if (ts.isCallExpression(access.parent) && access.parent.expression === access) return true
		node = access
	}
	return false
}

/** The modules a file names: static imports and re-exports, `import('...')`, `require('...')`, `vi.mock('...')`. */
export function moduleSpecifiers(text: string): string[] {
	const source = parseTestSource(text)
	const specifiers: string[] = []
	function visit(node: ts.Node): void {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier &&
			ts.isStringLiteralLike(node.moduleSpecifier)
		)
			specifiers.push(node.moduleSpecifier.text)
		if (
			ts.isCallExpression(node) &&
			node.arguments[0] &&
			ts.isStringLiteralLike(node.arguments[0])
		) {
			const callee = node.expression
			const named =
				callee.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(callee) && callee.text === 'require') ||
				(ts.isPropertyAccessExpression(callee) && callee.name.text === 'mock')
			if (named) specifiers.push(node.arguments[0].text)
		}
		ts.forEachChild(node, visit)
	}
	visit(source)
	return specifiers
}
