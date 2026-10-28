/**
 * The names closest to a name nobody declares, for a "did you mean": case ignored, a name holding it first,
 * then by edit distance up to a third of its length (at least 2), ties by name.
 */
import { TEXT_COLLATOR } from './skills/api-index.constants.ts'

export function closestNames(params: {
	name: string
	candidates: readonly string[]
	limit: number
}): string[] {
	const name = params.name.toLowerCase()
	const threshold = Math.max(2, Math.floor(name.length / 3))
	return params.candidates
		.map((candidate) => ({
			candidate,
			distance: candidate.toLowerCase().includes(name)
				? 0
				: editDistance({ from: name, to: candidate.toLowerCase() }),
		}))
		.filter(({ distance }) => distance <= threshold)
		.sort(
			(left, right) =>
				left.distance - right.distance || TEXT_COLLATOR.compare(left.candidate, right.candidate),
		)
		.slice(0, params.limit)
		.map(({ candidate }) => candidate)
}

/** Insertions, deletions and substitutions turning one word into the other. */
function editDistance(params: { from: string; to: string }): number {
	const { from, to } = params
	let previous = Array.from({ length: to.length + 1 }, (_, index) => index)
	for (let row = 1; row <= from.length; row++) {
		const current = [row]
		for (let column = 1; column <= to.length; column++)
			current[column] = Math.min(
				previous[column] + 1,
				current[column - 1] + 1,
				previous[column - 1] + (from[row - 1] === to[column - 1] ? 0 : 1),
			)
		previous = current
	}
	return previous[to.length]
}
