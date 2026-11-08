import { capSliceRange } from './cap-slice-range.ts'
import { roundScore } from './round-score.ts'

import type { StandardLogicalLine, StandardOriginalRange } from './standard-index.types.ts'
import type {
	StandardLineRange,
	StandardTermContribution,
	StandardWindowHit,
} from './standard-search.types.ts'

/**
 * The densest window of a unit's body hits (the hits off its heading title or caption line): of the windows
 * of whole logical lines that start at a hit and hold at most the slice's line count, the one whose distinct
 * terms add up to the largest share of the unit's score (each term counted once, at its contribution; sums
 * compared rounded to the score's decimals); ties: the earliest. Answers the standard lines of the window's
 * first and last hit, null when the unit has no body hit. The hits are walked once with two pointers; the
 * walk stops at a window holding every term of the unit, or reaching its last hit.
 */
export function bestWindowOf(params: {
	lines: StandardLogicalLine[]
	noiseRanges: StandardOriginalRange[]
	contributions: StandardTermContribution[]
	titleLine: number | null
}): StandardLineRange | null {
	const { lines, noiseRanges, contributions, titleLine } = params
	const hits = bodyHitsOf({ contributions, titleLine })
	if (hits.length === 0) return null
	const lastHit = hits[hits.length - 1].line
	const counts = contributions.map(() => 0)
	let held = 0
	let sum = 0
	let next = 0
	let best: StandardLineRange | null = null
	let bestSum = -1
	for (let start = 0; start < hits.length;) {
		const first = hits[start].line
		const end = capSliceRange({ lines, noiseRanges, first, last: lastHit, windowFirst: first }).last
		for (; next < hits.length && hits[next].line <= end; next++) {
			const { term } = hits[next]
			if (counts[term]++ === 0) {
				held++
				sum += contributions[term].contribution
			}
		}
		const rounded = roundScore(sum)
		if (rounded > bestSum) {
			best = { first, last: hits[next - 1].line }
			bestSum = rounded
		}
		// a later window holds no more than this one: one holding every term, or reaching the last hit
		if (held === contributions.length || end >= lastHit) break
		for (; start < next && hits[start].line === first; start++) {
			const { term } = hits[start]
			if (--counts[term] === 0) {
				held--
				sum -= contributions[term].contribution
			}
		}
	}
	return best
}

/** Each body hit as its line and the index of its term in the contributions, by line. */
function bodyHitsOf(params: {
	contributions: StandardTermContribution[]
	titleLine: number | null
}): StandardWindowHit[] {
	return params.contributions
		.flatMap((contribution, term) =>
			contribution.lines
				.filter((line) => line !== params.titleLine)
				.map((line): StandardWindowHit => ({ line, term })),
		)
		.sort((left, right) => left.line - right.line)
}
