import {
	ASSERTION_CALLEE,
	CASE_FUNCTIONS,
	CONDITION_MODIFIERS,
	META_GLOB_NAME,
	NEGATED_GLOB_PREFIX,
	ONLY_MARKER,
	SUITE_FUNCTIONS,
	TABLE_MODIFIERS,
	TEST_FUNCTIONS,
} from './tdd.constants.ts'

/** Questions about a test file's source, answered from its syntax tree (never from lines or greps). */
import ts from 'typescript'

import type { MetaGlob, SourceLocation, TestCall } from './tdd.types.ts'

/**
 * The position is inside an argument of an `expect(...)` (or `expect.soft(...)`) call that asserts: the
 * object of a matcher call (`expect(x).toBe(1)`, `expect(x).not.toBe(1)`, `expect(p).resolves.toBe(1)`).
 * An `expect(x)` without a matcher asserts nothing.
 */
export function isInsideAssertion(params: {
	text: string
	file: string
	location: SourceLocation
}): boolean {
	const source = parseTestSource({ text: params.text, kind: scriptKindOf(params.file) })
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
export function importedNames(params: { text: string; file: string }): Set<string> {
	const { text } = params
	const names = new Set<string>()
	for (const statement of parseTestSource({ text, kind: scriptKindOf(params.file) }).statements) {
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
	/** The file's path: its extension decides how it is parsed (a `.ts` file is not TSX). */
	file: string
	location: SourceLocation
}): string | undefined {
	const source = parseTestSource({ text: params.text, kind: scriptKindOf(params.file) })
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

/** The file's syntax tree, parsed as its extension says (`scriptKindOf`). */
function parseTestSource(params: { text: string; kind: ts.ScriptKind }): ts.SourceFile {
	return ts.createSourceFile('test.tsx', params.text, ts.ScriptTarget.Latest, true, params.kind)
}

/** How a source file parses, by its extension: `.ts` as TypeScript without JSX, `.tsx` with it, `.js`... */
export function scriptKindOf(file: string): ts.ScriptKind {
	if (file.endsWith('.tsx')) return ts.ScriptKind.TSX
	if (file.endsWith('.jsx')) return ts.ScriptKind.JSX
	if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS
	return ts.ScriptKind.TS
}

function positionOf(params: {
	source: ts.SourceFile
	location: SourceLocation
}): number | undefined {
	const { source, location } = params
	const lineStarts = source.getLineStarts()
	if (location.line < 1 || location.line > lineStarts.length) return undefined
	const position = lineStarts[location.line - 1] + Math.max(location.column - 1, 0)
	const lineEnd = lineStarts[location.line] ?? source.text.length
	// a column past its line's end is no position (the parser would throw on it)
	return position <= lineEnd ? position : undefined
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

/**
 * The lines holding a focus marker: a call through `.only` (`it.only(...)`, `describe.only(...)`,
 * `test.only.each(table)(...)`), a table case `only: true`. A reference that is not called
 * (`testCase.only ? it.only : it`, a runner picking per row) is not one.
 */
export function findOnlyMarkers(params: { text: string; file: string }): number[] {
	const { text } = params
	const source = parseTestSource({ text, kind: scriptKindOf(params.file) })
	const lines = new Set<number>()
	function visit(node: ts.Node): void {
		const isOnlyAccess =
			ts.isPropertyAccessExpression(node) &&
			node.name.text === ONLY_MARKER &&
			TEST_FUNCTIONS.includes(rootIdentifierOf(node.expression) ?? '') &&
			isCalled(node)
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

/** The access is the callee of a call, through further accesses (`it.only.each(...)`). */
function isCalled(access: ts.PropertyAccessExpression): boolean {
	let node: ts.Expression = access
	while (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node)
		node = node.parent
	return ts.isCallExpression(node.parent) && node.parent.expression === node
}

/**
 * Every `it` / `test` call of the file, with its title when it is written as a string, and the titles of
 * the `describe` / `suite` calls around it.
 */
export function listTestCalls(params: { text: string; file: string }): TestCall[] {
	const { text } = params
	const source = parseTestSource({ text, kind: scriptKindOf(params.file) })
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
				each: takesFormatTitle(node.expression),
				describePath: describePathOf(node),
			})
		}
		ts.forEachChild(node, visit)
	}
	visit(source)
	return calls
}

/**
 * The titles of the `describe` / `suite` calls whose arguments hold the node, outermost first: undefined
 * for a title the file computes (a variable, a template with substitutions, an `.each` / `.for` format).
 */
function describePathOf(node: ts.Node): (string | undefined)[] {
	const path: (string | undefined)[] = []
	for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent)
		if (
			ts.isCallExpression(parent) &&
			parent.arguments.some((argument) => argument === child) &&
			isSuiteCallee(parent.expression)
		)
			path.unshift(suiteTitleOf(parent))
	return path
}

/**
 * `describe(...)`, `suite.skip(...)`, `describe.each(table)(...)`, `describe.skipIf(condition)(...)`: the call
 * that takes a suite's title and body.
 */
function isSuiteCallee(callee: ts.Expression): boolean {
	if (ts.isCallExpression(callee)) return isSuiteCallee(callee.expression) && isModifierCall(callee)
	const root = rootIdentifierOf(callee)
	return root !== undefined && SUITE_FUNCTIONS.includes(root)
}

/** The suite call's title as written; undefined for an `.each` / `.for` format or a computed title. */
function suiteTitleOf(call: ts.CallExpression): string | undefined {
	const title = call.arguments[0]
	if (takesFormatTitle(call.expression) || !title || !ts.isStringLiteralLike(title))
		return undefined
	return title.text
}

/**
 * `it(...)`, `test.skip(...)`, `it.each(table)(...)`, `it.skipIf(condition)(...)`: the call that takes a
 * test's title and body.
 */
function isTestCallee(callee: ts.Expression): boolean {
	if (ts.isCallExpression(callee)) return isTestCallee(callee.expression) && isModifierCall(callee)
	const root = rootIdentifierOf(callee)
	return root !== undefined && CASE_FUNCTIONS.includes(root)
}

/** `.each(table)`, `.for(table)`, `.skipIf(condition)`, `.runIf(condition)`: a call returning the call that takes the title. */
function isModifierCall(call: ts.CallExpression): boolean {
	return (
		ts.isPropertyAccessExpression(call.expression) &&
		[...TABLE_MODIFIERS, ...CONDITION_MODIFIERS].includes(call.expression.name.text)
	)
}

/** The callee is a table call (`it.each(table)`, `describe.for(table)`): the title it takes is a format. */
function takesFormatTitle(callee: ts.Expression): boolean {
	return (
		ts.isCallExpression(callee) &&
		ts.isPropertyAccessExpression(callee.expression) &&
		TABLE_MODIFIERS.includes(callee.expression.name.text)
	)
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
export function moduleSpecifiers(params: { text: string; file: string }): string[] {
	const { text } = params
	const source = parseTestSource({ text, kind: scriptKindOf(params.file) })
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

/**
 * The `import.meta.glob(...)` calls of a file: per call, its patterns (a string or an array of strings), a
 * negated one (`!./skip.xml`) without its `!` in `exclude`.
 */
export function metaGlobs(params: { text: string; file: string }): MetaGlob[] {
	const source = parseTestSource({ text: params.text, kind: scriptKindOf(params.file) })
	const globs: MetaGlob[] = []
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node) && isMetaGlob(node.expression) && node.arguments[0]) {
			const argument = node.arguments[0]
			const patterns = ts.isArrayLiteralExpression(argument)
				? argument.elements.filter(ts.isStringLiteralLike).map((element) => element.text)
				: ts.isStringLiteralLike(argument)
					? [argument.text]
					: []
			globs.push({
				include: patterns.filter((pattern) => !pattern.startsWith(NEGATED_GLOB_PREFIX)),
				exclude: patterns
					.filter((pattern) => pattern.startsWith(NEGATED_GLOB_PREFIX))
					.map((pattern) => pattern.slice(NEGATED_GLOB_PREFIX.length)),
			})
		}
		ts.forEachChild(node, visit)
	}
	visit(source)
	return globs
}

/** `import.meta.glob`. */
function isMetaGlob(expression: ts.Expression): boolean {
	return (
		ts.isPropertyAccessExpression(expression) &&
		expression.name.text === META_GLOB_NAME &&
		ts.isMetaProperty(expression.expression) &&
		expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword
	)
}
