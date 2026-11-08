import { SLICE_LINE_CAP } from './standard-search.constants.ts'

import type { StandardLogicalLine, StandardOriginalRange } from './standard-index.types.ts'
import type { StandardLineRange } from './standard-search.types.ts'

/**
 * A range of whole logical lines (`first` to `last`, of one file) capped at the slice's line count:
 * kept whole when it holds at most the cap of non-noise original lines; else a window that starts at
 * `windowFirst` and takes whole logical lines while the count stays at or under the cap (a single
 * logical line over the cap is kept alone). The lines counted are every original line of the range but
 * those of the file's dropped runs (`noiseRanges`).
 */
export function capSliceRange(params: {
	lines: StandardLogicalLine[]
	noiseRanges: StandardOriginalRange[]
	first: number
	last: number
	windowFirst: number
}): StandardLineRange {
	const { lines, noiseRanges, first, last, windowFirst } = params
	if (countedLines({ from: lines[first].from, to: lines[last].to, noiseRanges }) <= SLICE_LINE_CAP)
		return { first, last }
	let end = windowFirst
	while (
		end < last &&
		countedLines({ from: lines[windowFirst].from, to: lines[end + 1].to, noiseRanges }) <=
			SLICE_LINE_CAP
	)
		end++
	return { first: windowFirst, last: end }
}

/** The original lines `from` to `to` but the dropped ones. */
function countedLines(params: {
	from: number
	to: number
	noiseRanges: StandardOriginalRange[]
}): number {
	const { from, to, noiseRanges } = params
	let count = to - from + 1
	for (const range of noiseRanges) {
		const overlap = Math.min(to, range.to) - Math.max(from, range.from) + 1
		if (overlap > 0) count -= overlap
	}
	return count
}
