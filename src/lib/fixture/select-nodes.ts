import type { SchemaSelectorPath } from '../schema/schema.types.ts'
import type { PlanNode } from './fixture.types.ts'

/**
 * The planned elements a constraint's selector reaches from the element declaring it, in document order:
 * each alternative's steps followed child by child (a name, or any element), from every descendant too when
 * the alternative starts with `.//`. An element reached by two alternatives is listed once.
 */
export function selectNodes(params: {
	scope: PlanNode
	paths: readonly SchemaSelectorPath[]
}): PlanNode[] {
	const { scope, paths } = params
	const selected = new Set<PlanNode>()
	for (const path of paths) {
		let reached = path.deep ? descendantsAndSelf({ node: scope }) : [scope]
		for (const step of path.steps)
			reached = reached.flatMap((node) =>
				node.children.filter((child) => step.name === undefined || child.tagName === step.name),
			)
		for (const node of reached) selected.add(node)
	}
	return [...selected]
}

/** The element and every element below it, in document order. */
export function descendantsAndSelf(params: { node: PlanNode }): PlanNode[] {
	const { node } = params
	return [node, ...node.children.flatMap((child) => descendantsAndSelf({ node: child }))]
}
