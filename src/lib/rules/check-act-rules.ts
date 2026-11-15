/**
 * The act rules of one test-shaped Dialecte-change file: `transaction-spy`, `act-repeats-call`, `act-snapshot` and
 * `act-format-check`.
 */
import { VITEST_PACKAGE } from '../tdd/tdd.constants.ts'
import { calleeName } from './callee-name.ts'
import {
	ACT_CALL_IN_LOOP_MESSAGE,
	ACT_REPEATS_CALL_MESSAGE,
	CLOCK_CALLEES,
	CLOCK_CONSTRUCTOR,
	COMPARISON_OPERATORS,
	ORDER_MATCHERS,
	PATTERN_MATCHERS,
	PATTERN_TEST_METHOD,
	SPY_CALLEES,
	SPY_FUNCTION,
	TIME_BRACKET_MESSAGE,
	TIME_BRACKET_SIZE,
	TRANSACTION_SPY_MESSAGE,
	UUID_BLOCK_PATTERN,
	UUID_FORMAT_MESSAGE,
	UUID_GROUP_COUNT,
	UUID_GROUP_PATTERN,
} from './check-act-rules.constants.ts'
import { snapshotsIn } from './check-act-snapshot.ts'
import { isQueryReceiver } from './check-query-in-loop.ts'
import { countedCallsByUnit } from './counted-unit-calls.ts'
import { expectCallOf, expectCallOfMatcher } from './expect-chains.ts'
import { childNodesOf, isFunctionNode, isWithin, positionOf, unwrapped } from './syntax-nodes.ts'
import { literalTextOf, pathTextOf } from './test-shape-tables.ts'
import { unitCallsIn } from './unit-under-test.ts'

import ts from 'typescript'

import type { UnitContext } from './check-code-rules.types.ts'
import type { QualityFinding } from './check-quality-rules.types.ts'
import type { TestShape } from './check-test-shape-rules.types.ts'
import type { NamedVariableDeclaration } from './syntax-nodes.types.ts'

/** Checks the act rules of one test-shaped file. */
export function checkActRules(params: {
	sourceFile: ts.SourceFile
	shape: TestShape
	units: UnitContext
}): QualityFinding[] {
	const { sourceFile, shape, units } = params
	const acts = [...new Set(shape.runners.flatMap((runner) => (runner.act ? [runner.act] : [])))]
	return [
		...transactionSpiesIn(sourceFile),
		...acts.flatMap((act) => repeatedCallsIn({ act, units, sourceFile })),
		...acts.flatMap((act) => snapshotsIn({ act, sourceFile })),
		...uuidPatternsIn({ sourceFile, acts }),
		...timeBracketsIn({ sourceFile, acts }),
	]
}

/**
 * `transaction-spy`: `vi.spyOn(<target>, ...)`, `jest.spyOn(...)` or a `spyOn` imported from vitest, its target
 * rooted at a query binding, anywhere in the file.
 */
function transactionSpiesIn(sourceFile: ts.SourceFile): QualityFinding[] {
	const spyNames = importedSpyNamesOf(sourceFile)
	const findings: QualityFinding[] = []
	function visit(node: ts.Node): void {
		const [target, method] = ts.isCallExpression(node) ? node.arguments : []
		if (
			ts.isCallExpression(node) &&
			target !== undefined &&
			isSpyCallee({ callee: unwrapped(node.expression), spyNames }) &&
			isQueryReceiver(target)
		) {
			const targetText = pathTextOf(target) ?? target.getText(sourceFile)
			const methodText = method === undefined ? undefined : literalTextOf(method)
			const spied = methodText === undefined ? targetText : `${targetText}.${methodText}`
			findings.push({
				...positionOf({ node, sourceFile }),
				rule: 'transaction-spy',
				severity: 'error',
				message: TRANSACTION_SPY_MESSAGE.replace('{spied}', spied),
			})
		}
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return findings
}

function isSpyCallee(params: { callee: ts.Expression; spyNames: ReadonlySet<string> }): boolean {
	const { callee } = params
	if (ts.isIdentifier(callee)) return params.spyNames.has(callee.text)
	const path = pathTextOf(callee)
	return path !== undefined && SPY_CALLEES.includes(path)
}

/** The local names `spyOn` is imported under from vitest (`import { spyOn } from 'vitest'`). */
function importedSpyNamesOf(sourceFile: ts.SourceFile): ReadonlySet<string> {
	return new Set(
		sourceFile.statements.flatMap((statement) => {
			if (
				!ts.isImportDeclaration(statement) ||
				!ts.isStringLiteral(statement.moduleSpecifier) ||
				statement.moduleSpecifier.text !== VITEST_PACKAGE
			)
				return []
			const bindings = statement.importClause?.namedBindings
			if (bindings === undefined || !ts.isNamedImports(bindings)) return []
			return bindings.elements
				.filter((element) => (element.propertyName ?? element.name).text === SPY_FUNCTION)
				.map((element) => element.name.text)
		}),
	)
}

/**
 * `act-repeats-call`: one finding per unit the act calls at two or more call sites that run in one pass (at the
 * second one; of arms that exclude each other only the larger counts), or at one call site inside a loop body (at that
 * one). The act's first line is the finding's `functionLine`, so an opt-out before the act covers it.
 */
function repeatedCallsIn(params: {
	act: ts.FunctionLikeDeclaration
	units: UnitContext
	sourceFile: ts.SourceFile
}): QualityFinding[] {
	const { act, sourceFile } = params
	const functionLine = positionOf({ node: act, sourceFile }).line
	if (act.body === undefined) return []
	const callsByUnit = countedCallsByUnit({ body: act.body, calls: unitCallsIn(params) })
	return [...callsByUnit].flatMap(([unit, calls]) => {
		const [first, second] = calls
		if (second === undefined && !first.inLoop) return []
		const message =
			second === undefined
				? ACT_CALL_IN_LOOP_MESSAGE.replace('{unit}', unit)
				: ACT_REPEATS_CALL_MESSAGE.replace('{unit}', unit).replace('{count}', String(calls.length))
		const { line, column } = second ?? first
		return [{ line, column, functionLine, rule: 'act-repeats-call', severity: 'error', message }]
	})
}

// act-format-check

/**
 * `act-format-check` (a): a regular expression literal holding a uuid shape, given to `toMatch` or `stringMatching`
 * or tested with `.test(`, anywhere in the file. Inside an act the act's first line is the `functionLine`.
 */
function uuidPatternsIn(params: {
	sourceFile: ts.SourceFile
	acts: readonly ts.FunctionLikeDeclaration[]
}): QualityFinding[] {
	const { sourceFile, acts } = params
	const findings: QualityFinding[] = []
	function visit(node: ts.Node): void {
		if (ts.isRegularExpressionLiteral(node) && isUuidShape(node.text) && isAssertedPattern(node)) {
			const act = acts.find((candidate) => isWithin({ node, container: candidate }))
			findings.push({
				...positionOf({ node, sourceFile }),
				...(act && { functionLine: positionOf({ node: act, sourceFile }).line }),
				rule: 'act-format-check',
				severity: 'error',
				message: UUID_FORMAT_MESSAGE,
			})
		}
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return findings
}

/** Does the pattern hold a uuid shape: eight hexadecimal digits, or two dashed groups of four. */
function isUuidShape(pattern: string): boolean {
	return (
		UUID_BLOCK_PATTERN.test(pattern) ||
		(pattern.match(UUID_GROUP_PATTERN)?.length ?? 0) >= UUID_GROUP_COUNT
	)
}

/** Is the literal the pattern of an assertion: an argument of `toMatch` / `stringMatching`, or `/re/.test(...)`. */
function isAssertedPattern(literal: ts.RegularExpressionLiteral): boolean {
	const { parent } = literal
	if (ts.isCallExpression(parent) && parent.arguments.some((argument) => argument === literal))
		return PATTERN_MATCHERS.includes(calleeName(unwrapped(parent.expression)))
	return (
		ts.isPropertyAccessExpression(parent) &&
		parent.expression === literal &&
		parent.name.text === PATTERN_TEST_METHOD &&
		ts.isCallExpression(parent.parent) &&
		parent.parent.expression === parent
	)
}

/**
 * `act-format-check` (b): two or more clock bindings of one act (or of one function outside the acts) asserted in an
 * order matcher or a comparison inside `expect(...)`. One finding per bracket, at its first binding; inside an act the
 * act's first line is the `functionLine`.
 */
function timeBracketsIn(params: {
	sourceFile: ts.SourceFile
	acts: readonly ts.FunctionLikeDeclaration[]
}): QualityFinding[] {
	const { sourceFile, acts } = params
	return [...clockBindingsByScope({ sourceFile, acts })].flatMap(([scope, bindings]) => {
		const asserted = assertedNamesIn({
			scope,
			clockNames: new Set(bindings.map((binding) => binding.name.text)),
		})
		const bracket = bindings.filter((binding) => asserted.has(binding.name.text))
		const [first] = bracket
		if (first === undefined || bracket.length < TIME_BRACKET_SIZE) return []
		const act = acts.find((candidate) => candidate === scope)
		return [
			{
				...positionOf({ node: first, sourceFile }),
				...(act && { functionLine: positionOf({ node: act, sourceFile }).line }),
				rule: 'act-format-check' as const,
				severity: 'error' as const,
				message: TIME_BRACKET_MESSAGE,
			},
		]
	})
}

/**
 * The clock bindings of the file (`const before = Date.now()`), in source order, by the act holding them, else by the
 * function (or the file) declaring them.
 */
function clockBindingsByScope(params: {
	sourceFile: ts.SourceFile
	acts: readonly ts.FunctionLikeDeclaration[]
}): Map<ts.Node, NamedVariableDeclaration[]> {
	const { sourceFile, acts } = params
	const byScope = new Map<ts.Node, NamedVariableDeclaration[]>()
	function visit(node: ts.Node): void {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined &&
			isClockRead(node.initializer)
		) {
			const scope =
				acts.find((act) => isWithin({ node, container: act })) ??
				enclosingFunctionOf(node) ??
				sourceFile
			byScope.set(scope, [...(byScope.get(scope) ?? []), node as NamedVariableDeclaration])
		}
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return byScope
}

/** Is the value a read of the clock: `Date.now()`, `performance.now()`, `new Date()`. */
function isClockRead(value: ts.Expression): boolean {
	const node = unwrapped(value)
	if (ts.isNewExpression(node))
		return (
			ts.isIdentifier(node.expression) &&
			node.expression.text === CLOCK_CONSTRUCTOR &&
			(node.arguments?.length ?? 0) === 0
		)
	if (!ts.isCallExpression(node) || node.arguments.length > 0) return false
	const path = pathTextOf(unwrapped(node.expression))
	return path !== undefined && CLOCK_CALLEES.includes(path)
}

function enclosingFunctionOf(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
	const { parent } = node
	if (parent === undefined) return undefined
	return isFunctionNode(parent) ? parent : enclosingFunctionOf(parent)
}

/**
 * The names asserted as an order under `scope`: in an order matcher (a bound inside its argument, `start - SLACK`
 * included, or the value of its `expect`), or an operand of a comparison inside the arguments of `expect(...)`. A
 * difference of two clock bindings (`end - start`) is a duration, never a bound: neither binding counts there.
 */
function assertedNamesIn(params: {
	scope: ts.Node
	clockNames: ReadonlySet<string>
}): ReadonlySet<string> {
	const { scope, clockNames } = params
	const names: string[] = []
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node)) names.push(...orderedNamesOf({ call: node, clockNames }))
		ts.forEachChild(node, visit)
	}
	visit(scope)
	return new Set(names)
}

/** The names one call asserts as an order: an order matcher's names, or the compared names of an `expect(...)`. */
function orderedNamesOf(params: {
	call: ts.CallExpression
	clockNames: ReadonlySet<string>
}): string[] {
	const { call, clockNames } = params
	const expectCall = expectCallOfMatcher({ call, matchers: ORDER_MATCHERS })
	if (expectCall !== undefined)
		return [
			...call.arguments.flatMap((argument) => boundNamesOf({ node: argument, clockNames })),
			...expectCall.arguments.flatMap(identifierTextOf),
		]
	if (expectCallOf(call) !== call) return []
	return call.arguments.flatMap(comparedNamesOf)
}

/** The operands of every comparison under `node` that are names. */
function comparedNamesOf(node: ts.Node): string[] {
	const own =
		ts.isBinaryExpression(node) && COMPARISON_OPERATORS.includes(node.operatorToken.kind)
			? [...identifierTextOf(node.left), ...identifierTextOf(node.right)]
			: []
	return [...own, ...childNodesOf(node).flatMap(comparedNamesOf)]
}

/** The name the expression is, as a list of one; empty for any other expression. */
function identifierTextOf(expression: ts.Expression): string[] {
	const value = unwrapped(expression)
	return ts.isIdentifier(value) ? [value.text] : []
}

/**
 * Every name `node` reads as a bound, at any depth (a property name after a dot is no read); a difference of two clock
 * readings is a duration and reads none.
 */
function boundNamesOf(params: { node: ts.Node; clockNames: ReadonlySet<string> }): string[] {
	const { node, clockNames } = params
	if (ts.isIdentifier(node)) return [node.text]
	if (ts.isPropertyAccessExpression(node))
		return boundNamesOf({ node: node.expression, clockNames })
	if (isDuration({ node, clockNames })) return []
	return childNodesOf(node).flatMap((child) => boundNamesOf({ node: child, clockNames }))
}

/** Is the node a subtraction with a clock binding on each side (`end - start`)? */
function isDuration(params: { node: ts.Node; clockNames: ReadonlySet<string> }): boolean {
	const { node, clockNames } = params
	return (
		ts.isBinaryExpression(node) &&
		node.operatorToken.kind === ts.SyntaxKind.MinusToken &&
		readsClock({ node: node.left, clockNames }) &&
		readsClock({ node: node.right, clockNames })
	)
}

/** Does the node read a clock binding anywhere inside it? */
function readsClock(params: { node: ts.Node; clockNames: ReadonlySet<string> }): boolean {
	const { node, clockNames } = params
	if (ts.isIdentifier(node)) return clockNames.has(node.text)
	if (ts.isPropertyAccessExpression(node)) return readsClock({ node: node.expression, clockNames })
	return childNodesOf(node).some((child) => readsClock({ node: child, clockNames }))
}
