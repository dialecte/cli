/**
 * What the test-shape rules read in a test-shaped file, on its syntax tree: the runner calls with their
 * table and act, the tables a loop iterates into tests, and every function that runs once per case with
 * how it reads its case.
 */

import { CASE_FUNCTIONS, TABLE_MODIFIERS } from '../tdd/tdd.constants.ts'
import {
	isModifierCall,
	isSuiteCallee,
	isTestCallee,
	rootIdentifierOf,
} from '../tdd/test-source.ts'
import { calleeName } from './callee-name.ts'
import {
	ACT_CASE_PROPERTY,
	RUNNER_ACT_PROPERTY,
	RUNNER_NAME_PATTERN,
	RUNNER_TABLE_PROPERTY,
	RUNNER_WITH_EXPORT,
	RUNNER_WITHOUT_EXPORT,
} from './check-test-shape-rules.constants.ts'
import { bindingNamesOf, isFunctionNode, unwrapped } from './syntax-nodes.ts'

import ts from 'typescript'

import type {
	CaseBinding,
	PerCaseFunction,
	RunnerCall,
	RunnerMode,
	TableCase,
	TestCallee,
	TestShape,
	TestTable,
} from './check-test-shape-rules.types.ts'

/** The runner calls, tables and per-case functions of one file. */
export function testShapeOf(sourceFile: ts.SourceFile): TestShape {
	const runners: RunnerCall[] = []
	const tables: TestTable[] = []
	const perCase: PerCaseFunction[] = []
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node)) {
			const runner = runnerCallOf({ node, sourceFile })
			if (runner) runners.push(runner)
			if (runner?.table) tables.push(runner.table)
			if (runner?.act)
				perCase.push(withBodyBindings({ node: runner.act, binding: actBindingOf(runner.act) }))
			const rowCallback = rowCallbackOf(node)
			if (rowCallback) perCase.push(rowCallback)
		}
		if (ts.isForOfStatement(node)) {
			const callbacks = loopCallbacksOf(node)
			perCase.push(...callbacks)
			const table = callbacks.length > 0 ? iteratedTableOf({ loop: node, sourceFile }) : undefined
			if (table) tables.push(table)
		}
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return { runners, tables, perCase }
}

/**
 * The test call a callee makes (`it`, `it.only`, `(focus ? it.only : it)`, `it.each(rows)`), or undefined for
 * any other callee.
 */
export function testCalleeOf(expression: ts.Expression): TestCallee | undefined {
	const callee = unwrapped(expression)
	// a focus toggle picks one of two test calls
	if (ts.isConditionalExpression(callee))
		return testCalleeOf(callee.whenTrue) ?? testCalleeOf(callee.whenFalse)
	if (ts.isCallExpression(callee)) {
		if (!isModifierCall(callee) || !ts.isPropertyAccessExpression(callee.expression))
			return undefined
		const inner = testCalleeOf(callee.expression.expression)
		return inner && { base: inner.base, factory: callee.expression.name.text }
	}
	// `it.each` of `it.each(rows)` returns the call taking the title: it takes none itself
	const parent = callee.parent
	if (
		parent &&
		ts.isCallExpression(parent) &&
		parent.expression === callee &&
		isModifierCall(parent)
	)
		return undefined
	if (!isTestCallee(callee) && !isSuiteCallee(callee)) return undefined
	const base = rootIdentifierOf(callee)
	return base === undefined ? undefined : { base, factory: undefined }
}

/** The text of a key or title as written: a string, or the literal head of a template; undefined otherwise. */
export function literalTextOf(expression: ts.Expression): string | undefined {
	const literal = unwrapped(expression)
	if (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal))
		return literal.text
	if (ts.isTemplateExpression(literal)) return literal.head.text
	return undefined
}

// runner calls

/** `runTestCases.withExport({ testCases, act })` and its kin, with the table and the act resolved. */
function runnerCallOf(params: {
	node: ts.CallExpression
	sourceFile: ts.SourceFile
}): RunnerCall | undefined {
	const { node, sourceFile } = params
	const callee = unwrapped(node.expression)
	const mode = runnerModeOf(callee)
	const runnerName =
		mode && ts.isPropertyAccessExpression(callee)
			? receiverNameOf(callee.expression)
			: calleeName(callee)
	const [argument] = node.arguments
	const options = argument && unwrapped(argument)
	if (!RUNNER_NAME_PATTERN.test(runnerName) || !options || !ts.isObjectLiteralExpression(options))
		return undefined
	const tableValue = propertyValueOf({ object: options, name: RUNNER_TABLE_PROPERTY })
	const actValue = propertyValueOf({ object: options, name: RUNNER_ACT_PROPERTY })
	return {
		node,
		mode,
		table:
			tableValue && !ts.isMethodDeclaration(tableValue)
				? tableOf({ expression: tableValue, sourceFile })
				: undefined,
		act: actValue && actOf(actValue),
	}
}

function runnerModeOf(callee: ts.Expression): RunnerMode {
	if (!ts.isPropertyAccessExpression(callee)) return undefined
	const name = callee.name.text
	if (name === RUNNER_WITH_EXPORT) return RUNNER_WITH_EXPORT
	if (name === RUNNER_WITHOUT_EXPORT) return RUNNER_WITHOUT_EXPORT
	return undefined
}

/** The runner a mode is read from: `runTestCases` in `runTestCases.withExport` or `runTestCases(...).withExport`. */
function receiverNameOf(expression: ts.Expression): string {
	const receiver = unwrapped(expression)
	return ts.isCallExpression(receiver)
		? calleeName(unwrapped(receiver.expression))
		: calleeName(receiver)
}

/** The value of a property of an object literal: its initializer, a shorthand's name or a method. */
function propertyValueOf(params: {
	object: ts.ObjectLiteralExpression
	name: string
}): ts.Expression | ts.MethodDeclaration | undefined {
	for (const property of params.object.properties) {
		if (!property.name || propertyTitleOf(property.name) !== params.name) continue
		if (ts.isPropertyAssignment(property)) return property.initializer
		if (ts.isShorthandPropertyAssignment(property)) return property.name
		if (ts.isMethodDeclaration(property)) return property
	}
	return undefined
}

/** The act given inline, or by a name resolved to a function declaration or a `const` function of the file. */
function actOf(
	value: ts.Expression | ts.MethodDeclaration,
): ts.FunctionLikeDeclaration | undefined {
	if (ts.isMethodDeclaration(value)) return value
	const act = unwrapped(value)
	if (isFunctionNode(act)) return act
	if (!ts.isIdentifier(act)) return undefined
	const declaration = declarationOf({ name: act.text, from: act })
	if (declaration && ts.isFunctionDeclaration(declaration)) return declaration
	const initializer = declaration?.initializer && unwrapped(declaration.initializer)
	return initializer && isFunctionNode(initializer) ? initializer : undefined
}

// tables

/** A table given inline, or by the name of a `const` of the file with its `<table>[<key>] = ...` assignments. */
function tableOf(params: {
	expression: ts.Expression
	sourceFile: ts.SourceFile
}): TestTable | undefined {
	const table = unwrapped(params.expression)
	if (ts.isObjectLiteralExpression(table)) return { cases: casesOfObject(table) }
	if (!ts.isIdentifier(table)) return undefined
	const declaration = declarationOf({ name: table.text, from: table })
	if (!declaration || !ts.isVariableDeclaration(declaration)) return undefined
	const initializer = declaration.initializer && unwrapped(declaration.initializer)
	return {
		cases: [
			...(initializer && ts.isObjectLiteralExpression(initializer)
				? casesOfObject(initializer)
				: []),
			...assignedCasesOf({ declaration, name: table.text, sourceFile: params.sourceFile }),
		],
	}
}

/** The table a `for (... of Object.entries(<table>))` loop iterates into its tests. */
function iteratedTableOf(params: {
	loop: ts.ForOfStatement
	sourceFile: ts.SourceFile
}): TestTable | undefined {
	const iterated = unwrapped(params.loop.expression)
	if (
		!ts.isCallExpression(iterated) ||
		!ts.isPropertyAccessExpression(iterated.expression) ||
		iterated.expression.name.text !== 'entries' ||
		calleeName(unwrapped(iterated.expression.expression)) !== 'Object'
	)
		return undefined
	const [table] = iterated.arguments
	return table && ts.isIdentifier(unwrapped(table))
		? tableOf({ expression: table, sourceFile: params.sourceFile })
		: undefined
}

function casesOfObject(object: ts.ObjectLiteralExpression): TableCase[] {
	return object.properties.flatMap((property) => {
		if (ts.isPropertyAssignment(property))
			return [
				{ key: property.name, title: propertyTitleOf(property.name), value: property.initializer },
			]
		if (ts.isShorthandPropertyAssignment(property))
			return [{ key: property.name, title: property.name.text, value: property.name }]
		return []
	})
}

/** The cases assigned to the table's name in the file: `testCases['a case'] = { ... }`. */
function assignedCasesOf(params: {
	declaration: ts.VariableDeclaration
	name: string
	sourceFile: ts.SourceFile
}): TableCase[] {
	const { declaration, name } = params
	const cases: TableCase[] = []
	function visit(node: ts.Node): void {
		if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
			const target = unwrapped(node.left)
			if (
				ts.isElementAccessExpression(target) &&
				ts.isIdentifier(target.expression) &&
				target.expression.text === name &&
				declarationOf({ name, from: target.expression }) === declaration
			)
				cases.push({
					key: target.argumentExpression,
					title: literalTextOf(target.argumentExpression),
					value: node.right,
				})
		}
		ts.forEachChild(node, visit)
	}
	visit(params.sourceFile)
	return cases
}

function propertyTitleOf(name: ts.PropertyName): string | undefined {
	if (
		ts.isIdentifier(name) ||
		ts.isStringLiteral(name) ||
		ts.isNumericLiteral(name) ||
		ts.isNoSubstitutionTemplateLiteral(name)
	)
		return name.text
	if (ts.isComputedPropertyName(name)) return literalTextOf(name.expression)
	return undefined
}

/**
 * The `const` or function declaration a name refers to from `from`: the nearest enclosing block or file that
 * declares it; undefined when a parameter on the way shadows it.
 */
function declarationOf(params: {
	name: string
	from: ts.Node
}): ts.VariableDeclaration | ts.FunctionDeclaration | undefined {
	const { name } = params
	for (let scope = params.from.parent; scope; scope = scope.parent) {
		if (
			isFunctionNode(scope) &&
			scope.parameters.some((parameter) => bindingNamesOf(parameter.name).includes(name))
		)
			return undefined
		if (!ts.isSourceFile(scope) && !ts.isBlock(scope) && !ts.isModuleBlock(scope)) continue
		const declared = declarationIn({ statements: scope.statements, name })
		if (declared) return declared
	}
	return undefined
}

function declarationIn(params: {
	statements: ts.NodeArray<ts.Statement>
	name: string
}): ts.VariableDeclaration | ts.FunctionDeclaration | undefined {
	for (const statement of params.statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name?.text === params.name)
			return statement
		if (
			!ts.isVariableStatement(statement) ||
			!(statement.declarationList.flags & ts.NodeFlags.Const)
		)
			continue
		const declaration = statement.declarationList.declarations.find(
			(candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === params.name,
		)
		if (declaration) return declaration
	}
	return undefined
}

// per-case functions and their case binding

/** The callback of `it.each(rows)(title, callback)` (and `.for`, `test`, `describe`): its first parameter is the row. */
function rowCallbackOf(node: ts.CallExpression): PerCaseFunction | undefined {
	const callee = testCalleeOf(node.expression)
	if (!callee?.factory || !TABLE_MODIFIERS.includes(callee.factory)) return undefined
	const callback = lastFunctionArgumentOf(node)
	const [row] = callback?.parameters ?? []
	return callback && row
		? withBodyBindings({ node: callback, binding: bindingOfName(row.name) })
		: undefined
}

/** The callbacks of the `it` / `test` calls a `for...of` loop makes, each reading the loop variable as its case. */
function loopCallbacksOf(loop: ts.ForOfStatement): PerCaseFunction[] {
	const binding = loopBindingOf(loop.initializer)
	if (!binding) return []
	const callbacks: PerCaseFunction[] = []
	function visit(node: ts.Node): void {
		const callee = ts.isCallExpression(node) ? testCalleeOf(node.expression) : undefined
		const callback =
			ts.isCallExpression(node) && callee && !callee.factory && CASE_FUNCTIONS.includes(callee.base)
				? lastFunctionArgumentOf(node)
				: undefined
		if (binding && callback) callbacks.push(withBodyBindings({ node: callback, binding }))
		ts.forEachChild(node, visit)
	}
	visit(loop.statement)
	return callbacks
}

/** The loop variable as a case: `row`, the value of `[title, testCase]`, or the fields of `{ kind }`. */
function loopBindingOf(initializer: ts.ForInitializer): CaseBinding | undefined {
	if (!ts.isVariableDeclarationList(initializer)) return undefined
	const [declaration] = initializer.declarations
	if (!declaration) return undefined
	if (!ts.isArrayBindingPattern(declaration.name)) return bindingOfName(declaration.name)
	const elements = declaration.name.elements
	const entry = elements[elements.length >= 2 ? 1 : 0]
	return entry && ts.isBindingElement(entry) ? bindingOfName(entry.name) : undefined
}

/** An act reads its case as its first parameter's `testCase`: destructured, or read through the parameter. */
function actBindingOf(act: ts.FunctionLikeDeclaration): CaseBinding {
	const [first] = act.parameters
	if (!first) return { roots: [], fields: [] }
	if (ts.isIdentifier(first.name))
		return { roots: [`${first.name.text}.${ACT_CASE_PROPERTY}`], fields: [] }
	if (!ts.isObjectBindingPattern(first.name)) return { roots: [], fields: [] }
	const element = first.name.elements.find(
		(candidate) => bindingPropertyOf(candidate) === ACT_CASE_PROPERTY,
	)
	return element ? bindingOfName(element.name) : { roots: [], fields: [] }
}

/** A name holding a case is a root; every name destructured from a case is a field. */
function bindingOfName(name: ts.BindingName): CaseBinding {
	return ts.isIdentifier(name)
		? { roots: [name.text], fields: [] }
		: { roots: [], fields: bindingNamesOf(name) }
}

/**
 * The binding grown by the function's own declarations, in source order: `const { nested } = testCase`
 * binds a field, `const { testCase } = params` or `const testCase = params.testCase` a root.
 */
function withBodyBindings(params: {
	node: ts.FunctionLikeDeclaration
	binding: CaseBinding
}): PerCaseFunction {
	const roots = [...params.binding.roots]
	const fields = [...params.binding.fields]
	function visit(node: ts.Node): void {
		const source =
			ts.isVariableDeclaration(node) && node.initializer ? pathTextOf(node.initializer) : undefined
		if (source !== undefined && ts.isVariableDeclaration(node)) {
			const grown = bindingFromDeclaration({ name: node.name, source, roots })
			roots.push(...grown.roots)
			fields.push(...grown.fields)
		}
		ts.forEachChild(node, visit)
	}
	if (params.node.body) visit(params.node.body)
	return { node: params.node, binding: { roots, fields } }
}

/** What `const <name> = <source>` adds to a case binding. */
function bindingFromDeclaration(params: {
	name: ts.BindingName
	source: string
	roots: readonly string[]
}): CaseBinding {
	const { name, source, roots } = params
	if (roots.includes(source)) return bindingOfName(name)
	if (!ts.isObjectBindingPattern(name) || !roots.includes(`${source}.${ACT_CASE_PROPERTY}`))
		return { roots: [], fields: [] }
	const element = name.elements.find(
		(candidate) => bindingPropertyOf(candidate) === ACT_CASE_PROPERTY,
	)
	return element ? bindingOfName(element.name) : { roots: [], fields: [] }
}

/** The property a binding element takes: `testCase` in `{ testCase }` and `{ testCase: row }`. */
function bindingPropertyOf(element: ts.BindingElement): string | undefined {
	const property = element.propertyName ?? element.name
	if (ts.isIdentifier(property) || ts.isStringLiteral(property)) return property.text
	return undefined
}

/** `params.testCase` for a name path; undefined for any other expression. */
export function pathTextOf(expression: ts.Expression): string | undefined {
	const path = unwrapped(expression)
	if (ts.isIdentifier(path)) return path.text
	if (!ts.isPropertyAccessExpression(path)) return undefined
	const owner = pathTextOf(path.expression)
	return owner === undefined ? undefined : `${owner}.${path.name.text}`
}

function lastFunctionArgumentOf(call: ts.CallExpression): ts.FunctionLikeDeclaration | undefined {
	const callback = call.arguments.at(-1)
	const candidate = callback && unwrapped(callback)
	return candidate && isFunctionNode(candidate) ? candidate : undefined
}
