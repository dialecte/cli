/** The unit under test of an act: the calls through a query binding past a namespace, and the calls of the package's own functions. */
import { QUERY_PATH_SEGMENTS } from './check-quality-rules.constants.ts'
import { isQueryReceiver, loopOfChild } from './check-query-in-loop.ts'
import { childNodesOf, positionOf, unwrapped } from './syntax-nodes.ts'
import { pathTextOf } from './test-shape-tables.ts'

import ts from 'typescript'

import type { UnitContext } from './check-code-rules.types.ts'
import type { LoopContext } from './check-query-in-loop.types.ts'
import type { UnitCall } from './unit-under-test.types.ts'

/** The calls of the unit under test in an act, in source order, nested callbacks included. */
export function unitCallsIn(params: {
	act: ts.FunctionLikeDeclaration
	units: UnitContext
}): UnitCall[] {
	const { act, units } = params
	if (act.body === undefined) return []
	return unitCallsUnder({ node: act.body, loop: undefined, units, sourceFile: act.getSourceFile() })
}

/**
 * The segments of a name path past its last query binding: the root, or the last `query`, `tx` or `any` segment
 * before the method (`widget`, `add` of `doc.query.widget.add`; `getRecord` of `query.getRecord`).
 */
export function segmentsPastBinding(segments: readonly string[]): string[] {
	const binding = segments
		.slice(0, -1)
		.reduce((last, segment, index) => (QUERY_PATH_SEGMENTS.includes(segment) ? index : last), 0)
	return segments.slice(binding + 1)
}

/** The unit calls under `node`, each marked when it runs in a loop body around it inside the act. */
function unitCallsUnder(params: {
	node: ts.Node
	loop: LoopContext | undefined
	units: UnitContext
	sourceFile: ts.SourceFile
}): UnitCall[] {
	const { node, loop, sourceFile } = params
	const unit = ts.isCallExpression(node) ? unitOf({ call: node, units: params.units }) : undefined
	const own =
		unit === undefined || !ts.isCallExpression(node)
			? []
			: [{ unit, ...positionOf({ node, sourceFile }), node, inLoop: loop !== undefined }]
	const nested = childNodesOf(node).flatMap((child) =>
		unitCallsUnder({
			...params,
			node: child,
			loop: loopOfChild({ parent: node, child, loop, sourceFile }),
		}),
	)
	return [...own, ...nested]
}

/**
 * The callee text when the call is one of the unit under test: a function the package's own source exports (by the
 * name the file imports it under), or a path through a query binding with two or more segments past it, the first
 * not a core group (`tx.widget.add`; not `tx.getStagedOperations`, nor `tx.progress.plan`).
 */
function unitOf(params: { call: ts.CallExpression; units: UnitContext }): string | undefined {
	const { units } = params
	const callee = unwrapped(params.call.expression)
	if (ts.isIdentifier(callee))
		return units.ownImports.get(callee.text) === 'unit' ? callee.text : undefined
	if (!ts.isPropertyAccessExpression(callee) || !isQueryReceiver(callee.expression))
		return undefined
	const path = pathTextOf(callee)
	if (path === undefined) return undefined
	const [namespace, ...rest] = segmentsPastBinding(path.split('.'))
	return rest.length > 0 && !units.coreGroups.has(namespace) ? path : undefined
}
