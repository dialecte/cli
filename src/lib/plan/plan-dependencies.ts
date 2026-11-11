import type { PlanBlock } from './plan-block.types.ts'

/**
 * For each entry id, the ids it depends on directly, in `dependsOn` order without repeats: a name is its entry, or
 * every entry of the group of that name. Pure.
 */
export function dependenciesOf(params: { block: PlanBlock }): Map<string, string[]> {
	const { lots } = params.block
	return new Map(
		lots.map((entry) => [
			entry.id,
			[...new Set(entry.dependsOn.flatMap((name) => membersOf({ block: params.block, name })))],
		]),
	)
}

/**
 * For each entry id, the ids that depend on it directly (the reverse of `dependenciesOf`), in block order. Pure.
 */
export function dependentsOf(params: {
	dependencies: Map<string, string[]>
}): Map<string, string[]> {
	const dependents = new Map<string, string[]>(
		[...params.dependencies.keys()].map((id) => [id, []]),
	)
	for (const [id, targets] of params.dependencies)
		for (const target of targets) dependents.get(target)?.push(id)
	return dependents
}

/** The entries a `dependsOn` name means: the entry with that id, else every entry of that group. */
function membersOf(params: { block: PlanBlock; name: string }): string[] {
	const { lots } = params.block
	if (lots.some((entry) => entry.id === params.name)) return [params.name]
	return lots.filter((entry) => entry.group === params.name).map((entry) => entry.id)
}
