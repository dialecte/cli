import type { StandardHeading } from './standard-index.types.ts'

/**
 * The number of the kept heading holding a line: the nearest kept heading at or before it (the deepest
 * whose range holds the line), null before the first one. `headings` are in file order.
 */
export function holdingClause(params: {
	headings: StandardHeading[]
	line: number
}): string | null {
	const { headings, line } = params
	let low = 0
	let high = headings.length - 1
	let found: StandardHeading | null = null
	while (low <= high) {
		const middle = (low + high) >> 1
		if (headings[middle].from <= line) {
			found = headings[middle]
			low = middle + 1
		} else high = middle - 1
	}
	return found?.number ?? null
}
