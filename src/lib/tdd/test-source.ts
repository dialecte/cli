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

import type {
	LocatedTestCall,
	MetaGlob,
	SourceLocation,
	Surroundings,
	TestCall,
	TestCallIndex,
} from './tdd.types.ts'

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
	return callTextAt({ source, location: params.location })
}

/** `testCallTextAt` on a file already parsed. */
function callTextAt(params: {
	source: ts.SourceFile
	location: SourceLocation
}): string | undefined {
	const { source } = params
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
	const source = parseTestSource({ text: params.text, kind: scriptKindOf(params.file) })
	return testCallNodesOf(source).map((node) => testCallOf({ node, source }))
}

/**
 * The test calls of the file (as `listTestCalls` lists them) with their offsets, indexed by where they
 * start: the file is parsed once, a reported location is then answered in O(1) (`testCallAt`).
 */
export function indexTestCalls(params: { text: string; file: string }): TestCallIndex {
	const source = parseTestSource({ text: params.text, kind: scriptKindOf(params.file) })
	return testCallIndexOf({ source, nodes: testCallNodesOf(source) })
}

/** The index of the test call nodes of a parsed file (`indexTestCalls`). */
function testCallIndexOf(params: {
	source: ts.SourceFile
	nodes: readonly ts.CallExpression[]
}): TestCallIndex {
	const { source } = params
	const calls = params.nodes.map((node): LocatedTestCall => ({
		...testCallOf({ node, source }),
		start: node.getStart(source),
		end: node.end,
		calleeEnd: node.expression.end,
	}))
	return {
		calls,
		byStart: new Map(calls.map((call) => [call.start, call])),
		lineStarts: source.getLineStarts(),
		callTextAt: (location) => callTextAt({ source, location }),
	}
}

/**
 * The title of the case a reported location points at is a table's format: its own call, or a suite call
 * holding it, is an `.each` / `.for` call (vitest fills a `$` field of such a title and cuts it).
 */
export function isTableTitledAt(params: {
	text: string
	file: string
	location: SourceLocation
}): boolean {
	const source = parseTestSource({ text: params.text, kind: scriptKindOf(params.file) })
	const nodes = testCallNodesOf(source)
	// the call as `testCallAt` locates it: one rule for where vitest points
	const call = testCallAt({ index: testCallIndexOf({ source, nodes }), location: params.location })
	if (!call) return false
	if (call.each) return true
	const node = nodes.find((candidate) => candidate.getStart(source) === call.start)
	return node !== undefined && isInsideTableSuite(node)
}

/** A `describe.each` / `describe.for` call holds the node in its arguments, at any depth. */
function isInsideTableSuite(node: ts.Node): boolean {
	for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent)
		if (
			ts.isCallExpression(parent) &&
			parent.arguments.some((argument) => argument === child) &&
			isSuiteCallee(parent.expression) &&
			takesFormatTitle(parent.expression)
		)
			return true
	return false
}

/**
 * The test call a reported location points at, as `testCallTextAt` reads it: the one starting there; else,
 * as vitest locates an `it.each` case at the parenthesis of the call taking its title, the innermost one
 * whose arguments hold the location. Undefined when the location is no test call (a runner's call).
 */
export function testCallAt(params: {
	index: TestCallIndex
	location: SourceLocation
}): LocatedTestCall | undefined {
	const { index, location } = params
	if (location.line < 1 || location.line > index.lineStarts.length) return undefined
	const position = index.lineStarts[location.line - 1] + Math.max(location.column - 1, 0)
	const starting = index.byStart.get(position)
	if (starting) return starting
	let holding: LocatedTestCall | undefined
	for (const call of index.calls)
		if (
			call.calleeEnd <= position &&
			position < call.end &&
			(!holding || call.start > holding.start)
		)
			holding = call
	return holding
}

/**
 * The code of the file outside its test calls: each statement holding no test call, keyed by the describe
 * path around it, the suites walked into; a statement holding a test call that is no suite (a loop over
 * rows, the call itself) registers cases and is left out. With every describe path the file has.
 */
export function listSurroundings(params: { text: string; file: string }): Surroundings {
	const source = parseTestSource({ text: params.text, kind: scriptKindOf(params.file) })
	const testCalls = testCallNodesOf(source)
	// a call of a function of the file holding a test call registers cases as the test call does
	const registrars = localRegistrarsOf({ source, testCalls })
	const starts = [...testCalls, ...callsOf({ source, names: registrars })]
		.map((node) => node.getStart(source))
		.sort((first, second) => first - second)
	/** A test call (or a call registering one) starts within the node: a binary search over the sorted starts. */
	function holdsTestCall(node: ts.Node): boolean {
		const from = node.getStart(source)
		let low = 0
		let high = starts.length
		while (low < high) {
			const middle = (low + high) >> 1
			if (starts[middle] < from) low = middle + 1
			else high = middle
		}
		return low < starts.length && starts[low] < node.end
	}
	const statements: Surroundings['statements'] = []
	const paths = [JSON.stringify([])]
	function walk(params: { nodes: readonly ts.Statement[]; path: (string | undefined)[] }): void {
		const key = JSON.stringify(params.path)
		for (const statement of params.nodes) {
			if (!holdsTestCall(statement)) {
				statements.push({
					path: key,
					text: statement.getText(source),
					calls: isRunStatement(statement) && holdsCall(statement),
				})
				continue
			}
			const body = suiteBodyOf(statement)
			if (!body) continue
			const path = [...params.path, suiteTitleOf(body.call)]
			paths.push(JSON.stringify(path))
			walk({ nodes: body.statements, path })
		}
	}
	walk({ nodes: source.statements, path: [] })
	return { statements, paths }
}

/** A statement that runs when the file loads (an expression, a loop, an `if`), not a declaration. */
function isRunStatement(statement: ts.Statement): boolean {
	return (
		ts.isExpressionStatement(statement) ||
		ts.isIterationStatement(statement, false) ||
		ts.isIfStatement(statement) ||
		ts.isBlock(statement)
	)
}

/** The node holds a call expression (itself included). */
function holdsCall(node: ts.Node): boolean {
	return ts.isCallExpression(node) || (ts.forEachChild(node, holdsCall) ?? false)
}

/**
 * The names of the functions the file declares (`function check() {}`, `const check = () => {}`) whose body
 * holds a test call: calling one registers cases.
 */
function localRegistrarsOf(params: {
	source: ts.SourceFile
	testCalls: readonly ts.CallExpression[]
}): Set<string> {
	const names = new Set<string>()
	for (const call of params.testCalls)
		for (let node: ts.Node | undefined = call.parent; node; node = node.parent) {
			if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text)
			if (
				(ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
				ts.isVariableDeclaration(node.parent) &&
				ts.isIdentifier(node.parent.name)
			)
				names.add(node.parent.name.text)
		}
	return names
}

/** The calls of the file whose callee is one of `names`. */
function callsOf(params: {
	source: ts.SourceFile
	names: ReadonlySet<string>
}): ts.CallExpression[] {
	const calls: ts.CallExpression[] = []
	if (params.names.size === 0) return calls
	function visit(node: ts.Node): void {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			params.names.has(node.expression.text)
		)
			calls.push(node)
		ts.forEachChild(node, visit)
	}
	visit(params.source)
	return calls
}

/** A `describe(title, () => { ... })` statement: its call and the statements of its body. */
function suiteBodyOf(
	statement: ts.Statement,
): { call: ts.CallExpression; statements: readonly ts.Statement[] } | undefined {
	if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression))
		return undefined
	const call = statement.expression
	if (!isSuiteCallee(call.expression)) return undefined
	const callback = call.arguments.find(
		(argument): argument is ts.ArrowFunction | ts.FunctionExpression =>
			ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
	)
	if (!callback || !ts.isBlock(callback.body)) return undefined
	return { call, statements: callback.body.statements }
}

/** The test call nodes of the file, in source order: the call that takes the title, never its callee. */
function testCallNodesOf(source: ts.SourceFile): ts.CallExpression[] {
	const nodes: ts.CallExpression[] = []
	function visit(node: ts.Node): void {
		const takesTitleLater =
			node.parent !== undefined &&
			ts.isCallExpression(node.parent) &&
			node.parent.expression === node
		if (ts.isCallExpression(node) && !takesTitleLater && isTestCallee(node.expression))
			nodes.push(node)
		ts.forEachChild(node, visit)
	}
	visit(source)
	return nodes
}

/** A test call node as `listTestCalls` answers it. */
function testCallOf(params: { node: ts.CallExpression; source: ts.SourceFile }): TestCall {
	const { node, source } = params
	const title = node.arguments[0]
	return {
		title: title && ts.isStringLiteralLike(title) ? title.text : undefined,
		text: node.getText(source),
		each: takesFormatTitle(node.expression),
		describePath: describePathOf(node),
	}
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
