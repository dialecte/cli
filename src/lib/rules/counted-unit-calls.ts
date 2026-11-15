/** The call sites of the unit under test an act can run in one pass, by unit. */
import { childNodesOf } from './syntax-nodes.ts'

import ts from 'typescript'

import type { ExclusiveArms } from './counted-unit-calls.types.ts'
import type { UnitCall } from './unit-under-test.types.ts'

/**
 * The calls of each unit that count together under `body`, in source order: sequential call sites add up; of arms
 * that exclude each other (`if` / `else`, the sides of `?:`, the clauses of a `switch`) only the arm with the most
 * call sites of that unit counts (a call in a loop body weighs more on a tie; the first arm wins a full tie).
 */
export function countedCallsByUnit(params: {
	body: ts.Node
	calls: readonly UnitCall[]
}): Map<string, UnitCall[]> {
	const callsByNode = new Map<ts.Node, UnitCall>(params.calls.map((call) => [call.node, call]))
	return countedUnder({ node: params.body, callsByNode })
}

function countedUnder(params: {
	node: ts.Node
	callsByNode: ReadonlyMap<ts.Node, UnitCall>
}): Map<string, UnitCall[]> {
	const { node, callsByNode } = params
	const own = callsByNode.get(node)
	const exclusive = exclusiveArmsOf(node)
	const sequential = (exclusive?.shared ?? childNodesOf(node)).reduce(
		(counted, child) =>
			mergedCalls({ first: counted, after: countedUnder({ node: child, callsByNode }) }),
		new Map<string, UnitCall[]>(own === undefined ? [] : [[own.unit, [own]]]),
	)
	if (exclusive === undefined) return sequential
	const arms = exclusive.arms.map((arm) => countedUnder({ node: arm, callsByNode }))
	return mergedCalls({ first: sequential, after: largestArmByUnit(arms) })
}

/** The parts of a branching node: `if` / `else`, a conditional expression, a `switch`; undefined for any other node. */
function exclusiveArmsOf(node: ts.Node): ExclusiveArms | undefined {
	if (ts.isIfStatement(node))
		return {
			shared: [node.expression],
			arms:
				node.elseStatement === undefined
					? [node.thenStatement]
					: [node.thenStatement, node.elseStatement],
		}
	if (ts.isConditionalExpression(node))
		return { shared: [node.condition], arms: [node.whenTrue, node.whenFalse] }
	if (ts.isSwitchStatement(node))
		return { shared: [node.expression], arms: [...node.caseBlock.clauses] }
	return undefined
}

/** Per unit, the calls of the arm holding the most of them. */
function largestArmByUnit(arms: readonly Map<string, UnitCall[]>[]): Map<string, UnitCall[]> {
	const largest = new Map<string, UnitCall[]>()
	for (const arm of arms)
		for (const [unit, calls] of arm) {
			const current = largest.get(unit)
			if (current === undefined || isLarger({ calls, than: current })) largest.set(unit, calls)
		}
	return largest
}

function isLarger(params: { calls: readonly UnitCall[]; than: readonly UnitCall[] }): boolean {
	const { calls, than } = params
	if (calls.length !== than.length) return calls.length > than.length
	return calls.some((call) => call.inLoop) && !than.some((call) => call.inLoop)
}

/** Each unit's calls of `first`, then its calls of `after`. */
function mergedCalls(params: {
	first: ReadonlyMap<string, UnitCall[]>
	after: ReadonlyMap<string, UnitCall[]>
}): Map<string, UnitCall[]> {
	const merged = new Map(params.first)
	for (const [unit, calls] of params.after)
		merged.set(unit, [...(merged.get(unit) ?? []), ...calls])
	return merged
}
