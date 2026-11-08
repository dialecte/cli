import { TOP_LEVEL_JUMP_LIMIT } from './standard-index.constants.ts'

import type { StandardHeadingCandidate, StandardKeptCandidate } from './standard-index.types.ts'

/**
 * Keeps the longest tree-consistent sequence of heading candidates, per pass. A candidate numbered
 * exactly `1` starts a new pass when the current pass already holds one. Within a pass, a step from a
 * candidate to a later one goes up in tree order, deepens by one level at most, and jumps at the top
 * level by the limit at most (a number to an annex letter always may). Among the longest sequences, the
 * one whose line numbers are lexicographically smallest wins.
 */
export function selectHeadings(params: {
	candidates: StandardHeadingCandidate[]
}): StandardKeptCandidate[] {
	return passesOf(params.candidates).flatMap((pass, index) =>
		longestSequence(pass).map((candidate) => ({ ...candidate, pass: index + 1 })),
	)
}

function passesOf(candidates: StandardHeadingCandidate[]): StandardHeadingCandidate[][] {
	const passes: StandardHeadingCandidate[][] = [[]]
	let holdsOne = false
	for (const candidate of candidates) {
		if (candidate.number === '1') {
			if (holdsOne) passes.push([])
			holdsOne = true
		}
		passes[passes.length - 1].push(candidate)
	}
	return passes
}

/**
 * The longest chain from each candidate by dynamic programming from the end, then the walk from the
 * earliest candidate with the longest chain, taking each time the earliest successor that keeps it.
 */
function longestSequence(candidates: StandardHeadingCandidate[]): StandardHeadingCandidate[] {
	if (candidates.length === 0) return []
	const lengths = candidates.map(() => 1)
	for (let from = candidates.length - 1; from >= 0; from--)
		for (let to = from + 1; to < candidates.length; to++)
			if (
				lengths[to] + 1 > lengths[from] &&
				isValidStep({ from: candidates[from], to: candidates[to] })
			)
				lengths[from] = lengths[to] + 1
	const longest = lengths.reduce((maximum, length) => Math.max(maximum, length), 0)
	let current = lengths.indexOf(longest)
	const sequence = [candidates[current]]
	while (lengths[current] > 1) {
		const remaining = lengths[current] - 1
		let next = current + 1
		while (
			!(
				lengths[next] === remaining &&
				isValidStep({ from: candidates[current], to: candidates[next] })
			)
		)
			next++
		sequence.push(candidates[next])
		current = next
	}
	return sequence
}

function isValidStep(params: {
	from: StandardHeadingCandidate
	to: StandardHeadingCandidate
}): boolean {
	const { from, to } = params
	if (compareTreeOrder({ first: from.order, second: to.order }) >= 0) return false
	if (to.depth > from.depth + 1) return false
	if (from.top !== null && to.top !== null) return to.top - from.top <= TOP_LEVEL_JUMP_LIMIT
	return true
}

/** Part by part; a shorter prefix comes first. */
function compareTreeOrder(params: { first: number[]; second: number[] }): number {
	const { first, second } = params
	const shared = Math.min(first.length, second.length)
	for (let part = 0; part < shared; part++)
		if (first[part] !== second[part]) return first[part] - second[part]
	return first.length - second.length
}
