/**
 * The order checks between the entries of a lot block: no `dependsOn` cycle, and entries sharing a branch ordered
 * by `dependsOn` (the transitive closure, a group meaning every entry of it), each naming its hand-over. Pure.
 */
import type { PlanFault } from './plan-block.types.ts'
import type { PlanOrderNode } from './plan.types.ts'

/** The order faults of the block's entries (one per cycle found first, one per unordered branch). Pure. */
export function orderFaultsOf(params: { nodes: readonly PlanOrderNode[] }): PlanFault[] {
	const edges = edgesOf({ nodes: params.nodes })
	const cycle = firstCycleOf({ edges })
	const cycleFaults: PlanFault[] =
		cycle === undefined
			? []
			: [
					{
						at: 'block',
						detail: `a dependsOn cycle: ${cycle.map((index) => nameOf({ nodes: params.nodes, index })).join(' -> ')}`,
					},
				]
	return [...cycleFaults, ...sharedBranchFaultsOf({ nodes: params.nodes, edges })]
}

/** For each entry, the entries it depends on directly: an id is its entry, a group every entry of it. */
function edgesOf(params: { nodes: readonly PlanOrderNode[] }): number[][] {
	const { nodes } = params
	return nodes.map(function dependenciesOf(node) {
		const targets = node.dependsOn.flatMap((name) => membersOf({ nodes, name }))
		return [...new Set(targets)]
	})
}

/** The entries a `dependsOn` name means: the first entry with that id, else every entry of that group. */
function membersOf(params: { nodes: readonly PlanOrderNode[]; name: string }): number[] {
	const byId = params.nodes.findIndex((node) => node.id === params.name)
	if (byId !== -1) return [byId]
	return params.nodes.flatMap((node, index) => (node.group === params.name ? [index] : []))
}

/**
 * The first cycle met walking the entries in block order, as entry indexes closed on its first one, started at its
 * member first in block order; undefined without a cycle.
 */
function firstCycleOf(params: { edges: readonly number[][] }): number[] | undefined {
	const finished = new Set<number>()
	for (let start = 0; start < params.edges.length; start += 1) {
		const cycle = cycleFrom({ edges: params.edges, index: start, stack: [], finished })
		if (cycle !== undefined) return rotatedToFirst(cycle)
	}
	return undefined
}

/** A cycle reached from `index` along the edges (the stack is the path walked to it); finished entries hold none. */
function cycleFrom(params: {
	edges: readonly number[][]
	index: number
	stack: readonly number[]
	finished: Set<number>
}): number[] | undefined {
	const { edges, index, finished } = params
	const onStack = params.stack.indexOf(index)
	if (onStack !== -1) return params.stack.slice(onStack)
	if (finished.has(index)) return undefined
	const stack = [...params.stack, index]
	for (const target of edges[index]) {
		const cycle = cycleFrom({ edges, index: target, stack, finished })
		if (cycle !== undefined) return cycle
	}
	finished.add(index)
	return undefined
}

/** The cycle started at its member first in block order, closed on it (`A -> B -> A`). */
function rotatedToFirst(cycle: readonly number[]): number[] {
	const first = cycle.indexOf(Math.min(...cycle))
	const rotated = [...cycle.slice(first), ...cycle.slice(0, first)]
	return [...rotated, rotated[0]]
}

/**
 * Entries sharing a branch: each names its `match.handover` (the only way to tell their records apart), and every
 * two of them are ordered by the transitive `dependsOn` closure, one fault per branch that is not.
 */
function sharedBranchFaultsOf(params: {
	nodes: readonly PlanOrderNode[]
	edges: readonly number[][]
}): PlanFault[] {
	const { nodes, edges } = params
	const branches = [
		...new Set(nodes.flatMap((node) => (node.branch === undefined ? [] : [node.branch]))),
	]
	return branches.flatMap(function faultsOfBranch(branch) {
		const sharing = nodes.flatMap((node, index) => (node.branch === branch ? [index] : []))
		if (sharing.length < 2) return []
		const names = sharing.map((index) => nameOf({ nodes, index })).join(', ')
		const handoverFaults = sharing
			.filter((index) => !nodes[index].hasHandover)
			.map((index) => ({
				at: `lots[${index}].match.handover`,
				detail: `${nameOf({ nodes, index })} shares the branch ${branch} with ${names}: each names its match.handover`,
			}))
		const closures = new Map(sharing.map((index) => [index, closureOf({ edges, index })]))
		const unordered = unorderedPairOf({ sharing, closures })
		const orderFaults =
			unordered === undefined
				? []
				: [
						{
							at: 'block',
							detail: `shared branch without order: ${nameOf({ nodes, index: unordered[0] })} and ${nameOf({ nodes, index: unordered[1] })} on ${branch}; order them with dependsOn`,
						},
					]
		return [...handoverFaults, ...orderFaults]
	})
}

/** The first two entries of the branch neither of which depends on the other, even transitively. */
function unorderedPairOf(params: {
	sharing: readonly number[]
	closures: ReadonlyMap<number, ReadonlySet<number>>
}): [number, number] | undefined {
	const { sharing, closures } = params
	for (const [position, first] of sharing.entries())
		for (const second of sharing.slice(position + 1))
			if (!closures.get(first)?.has(second) && !closures.get(second)?.has(first))
				return [first, second]
	return undefined
}

/** Every entry `index` depends on, directly or through others. */
function closureOf(params: { edges: readonly number[][]; index: number }): Set<number> {
	const reached = new Set<number>()
	const pending = [...params.edges[params.index]]
	while (pending.length > 0) {
		const next = pending.pop() as number
		if (reached.has(next)) continue
		reached.add(next)
		pending.push(...params.edges[next])
	}
	return reached
}

/** An entry's id, or where it is when it has none. */
function nameOf(params: { nodes: readonly PlanOrderNode[]; index: number }): string {
	return params.nodes[params.index].id ?? `lots[${params.index}]`
}
