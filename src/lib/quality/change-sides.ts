/**
 * The two sides of a change for the base-aware rules: which functions it adds (or whose read keys it changes) and
 * which already existed, from the facts of the tree and of the base side of the changed paths.
 */
import { MOVED_BODY_MIN_TOKENS } from './quality.constants.ts'

import type { FunctionFacts } from '../api/source-functions.types.ts'
import type { ChangeFacts, FunctionSides, SidedFunction } from './quality.types.ts'

/**
 * The added and the existing functions of `change`. A tree function is the same as a base function when it keeps its
 * file and name, keeps its name through a rename, or keeps its body (enough tokens to tell) while the base one is
 * gone from its place. Added: no same base function, or one whose read keys changed; existing: every function the
 * same as a base function (a function whose keys changed is on both sides).
 *
 * @intent tell a function the change adds from one it keeps or moves
 * @internal
 */
export function functionSidesOf(change: ChangeFacts): FunctionSides {
	const touched = new Set(change.changed.map((path) => path.path))
	const fromOf = new Map(
		change.changed.flatMap((path) =>
			path.state === 'renamed' ? [[path.path, path.from] as const] : [],
		),
	)
	const goneFromPlace = goneBaseFunctionsOf(change)
	const added: SidedFunction[] = []
	const existing: SidedFunction[] = []
	for (const [file, facts] of change.tree)
		for (const tree of facts.functions) {
			const sided = { file, facts: tree }
			if (!touched.has(file)) {
				existing.push(sided)
				continue
			}
			const same = sameBaseFunctionOf({ change, file, tree, from: fromOf.get(file), goneFromPlace })
			if (same !== undefined) existing.push(sided)
			if (same === undefined || !sameReadKeys(same, tree)) added.push(sided)
		}
	return { added, existing }
}

/** The base function `tree` (in `file`) is the same as; undefined when none. */
function sameBaseFunctionOf(params: {
	change: ChangeFacts
	file: string
	tree: FunctionFacts
	from: string | undefined
	goneFromPlace: readonly FunctionFacts[]
}): FunctionFacts | undefined {
	const { change, tree } = params
	const inPlace = change.base
		.get(params.from ?? params.file)
		?.functions.find((base) => base.name === tree.name)
	if (inPlace !== undefined) return inPlace
	if (tree.bodyTokenCount < MOVED_BODY_MIN_TOKENS) return undefined
	return params.goneFromPlace.find((base) => base.bodyHash === tree.bodyHash)
}

/** The base functions of the changed paths that are no longer at their place: their file gone, or their name gone from it. */
function goneBaseFunctionsOf(change: ChangeFacts): FunctionFacts[] {
	return [...change.base].flatMap(function goneOf([file, facts]) {
		const tree = change.tree.get(file)
		return facts.functions.filter(
			(base) => tree === undefined || !tree.functions.some((kept) => kept.name === base.name),
		)
	})
}

/** Whether two functions read the same keys. */
function sameReadKeys(first: FunctionFacts, second: FunctionFacts): boolean {
	return JSON.stringify(first.readKeys) === JSON.stringify(second.readKeys)
}
