/**
 * `query-in-loop`: a query read called in a loop body, once per item, where one read before the loop
 * would do. Syntactic: the method name is a query read name and its receiver a query binding.
 */
import { LEADING_POSITIONAL_PARAMETERS } from './check-code-rules.constants.ts'
import {
	CLASS_NAME_PATTERN,
	LOOP_CALLBACK_METHODS,
	PERF_PATH_SEGMENT,
	QUERY_BINDING_SUFFIXES,
	QUERY_PATH_SEGMENTS,
} from './check-quality-rules.constants.ts'
import { childNodesOf, isFunctionNode, positionOf, unwrapped } from './syntax-nodes.ts'

import ts from 'typescript'

import type { QualityFinding } from './check-quality-rules.types.ts'
import type { LoopContext, QueryRead } from './check-query-in-loop.types.ts'

/** One finding per innermost loop and query read method, at its first call in the loop body. */
export function checkQueryInLoop(params: {
	sourceFile: ts.SourceFile
	queryNames: ReadonlySet<string>
}): QualityFinding[] {
	const { sourceFile } = params
	const reported = new Set<string>()
	const findings: QualityFinding[] = []
	for (const { call, method, loop } of queryReadsIn({
		...params,
		node: sourceFile,
		loop: undefined,
	})) {
		const key = `${loop.node.getStart(sourceFile)}:${method}`
		if (reported.has(key)) continue
		reported.add(key)
		const per = loop.iterated === undefined ? 'loop iteration' : `\`${loop.iterated}\` item`
		findings.push({
			...positionOf({ node: call, sourceFile }),
			rule: 'query-in-loop',
			severity: 'error',
			message: `\`${method}\` called once per ${per}: read them in one query before the loop`,
		})
	}
	return findings
}

/** The query reads under `node` that run in a loop body, in source order, each with its innermost loop. */
function queryReadsIn(params: {
	node: ts.Node
	loop: LoopContext | undefined
	sourceFile: ts.SourceFile
	queryNames: ReadonlySet<string>
}): QueryRead[] {
	const { node, loop } = params
	const method = loop && ts.isCallExpression(node) ? queryMethodOf(node) : undefined
	const own =
		loop && method && params.queryNames.has(method) && ts.isCallExpression(node)
			? [{ call: node, method, loop }]
			: []
	const nested = childNodesOf(node).flatMap((child) =>
		queryReadsIn({
			...params,
			node: child,
			loop: loopOfChild({ ...params, parent: node, child }),
		}),
	)
	return [...own, ...nested]
}

/**
 * The loop `child` runs in: a loop body (`for`, `for...of`, `for...in`, `while`, `do`) or the callback of
 * a `LOOP_CALLBACK_METHODS` call starts a loop; a loop header, the iterated expression and a callback
 * method's receiver stay in the loop around it.
 */
function loopOfChild(params: {
	parent: ts.Node
	child: ts.Node
	loop: LoopContext | undefined
	sourceFile: ts.SourceFile
}): LoopContext | undefined {
	const { parent, child, loop, sourceFile } = params
	if ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && child === parent.statement)
		return {
			node: parent,
			iterated: chainRootTextOf({ expression: parent.expression, sourceFile }),
		}
	if (
		(ts.isForStatement(parent) || ts.isWhileStatement(parent) || ts.isDoStatement(parent)) &&
		child === parent.statement
	)
		return { node: parent, iterated: undefined }
	if (
		ts.isCallExpression(parent) &&
		isFunctionNode(child) &&
		parent.arguments.some((argument) => argument === child)
	) {
		const callee = unwrapped(parent.expression)
		if (ts.isPropertyAccessExpression(callee) && LOOP_CALLBACK_METHODS.includes(callee.name.text))
			return {
				node: child,
				iterated: chainRootTextOf({ expression: callee.expression, sourceFile }),
			}
	}
	return loop
}

/**
 * The name path a chain of calls starts from, on one line: `params.ids` of `params.ids.filter(...).map`,
 * `Object.entries(table)` of `Object.entries(table).map`, the expression itself when it starts from no name path.
 */
function chainRootTextOf(params: { expression: ts.Expression; sourceFile: ts.SourceFile }): string {
	const root = chainRootOf(params.expression) ?? params.expression
	return root.getText(params.sourceFile).replace(/\s+/g, ' ')
}

/** The name path under a chain's calls and member reads; undefined when it starts from anything else. */
function chainRootOf(expression: ts.Expression): ts.Expression | undefined {
	const inner = unwrapped(expression)
	if (isNamePath(inner)) return inner
	if (ts.isCallExpression(inner)) {
		const callee = unwrapped(inner.expression)
		if (!ts.isPropertyAccessExpression(callee) && !ts.isElementAccessExpression(callee))
			return undefined
		// a static call of a class or namespace (`Object.entries(table)`) starts the chain itself
		return isClassName(callee.expression) ? inner : chainRootOf(callee.expression)
	}
	if (ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner))
		return chainRootOf(inner.expression)
	return undefined
}

/** A capitalised name: a class or a namespace (`Object`, `Array`), never the data a chain runs over. */
function isClassName(expression: ts.Expression): boolean {
	return ts.isIdentifier(expression) && CLASS_NAME_PATTERN.test(expression.text)
}

/** A name, `this`, or member reads of one (`params.state.items`). */
function isNamePath(expression: ts.Expression): boolean {
	if (ts.isIdentifier(expression) || expression.kind === ts.SyntaxKind.ThisKeyword) return true
	if (ts.isPropertyAccessExpression(expression)) return isNamePath(expression.expression)
	return false
}

/**
 * The method name of `receiver.method(...)` when the receiver is rooted at a query binding and goes through no
 * `perf` segment (`doc.query.perf.getRecord()` measures, it reads nothing); undefined otherwise.
 */
function queryMethodOf(call: ts.CallExpression): string | undefined {
	const callee = unwrapped(call.expression)
	if (!ts.isPropertyAccessExpression(callee)) return undefined
	if (goesThroughPerf(callee.expression)) return undefined
	return isQueryReceiver(callee.expression) ? callee.name.text : undefined
}

/** A member read path with a `perf` property anywhere along it (`doc.query.perf`, `query.perf.ns`). */
function goesThroughPerf(expression: ts.Expression): boolean {
	const inner = unwrapped(expression)
	if (!ts.isPropertyAccessExpression(inner)) return false
	return inner.name.text === PERF_PATH_SEGMENT || goesThroughPerf(inner.expression)
}

/**
 * A name path rooted at `query`, `tx`, `transaction` or a name ending in `Query` / `Tx`, or going through
 * `.query`, `.tx` or `.any` (`context.query.any`, `doc.query.ns`).
 */
function isQueryReceiver(expression: ts.Expression): boolean {
	const inner = unwrapped(expression)
	if (ts.isIdentifier(inner))
		return (
			LEADING_POSITIONAL_PARAMETERS.includes(inner.text) ||
			QUERY_BINDING_SUFFIXES.some((suffix) => inner.text.endsWith(suffix))
		)
	if (!ts.isPropertyAccessExpression(inner)) return false
	return QUERY_PATH_SEGMENTS.includes(inner.name.text) || isQueryReceiver(inner.expression)
}
