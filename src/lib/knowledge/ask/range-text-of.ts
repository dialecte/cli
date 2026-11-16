import { countedLines } from '../standard/cap-slice-range.ts'
import { showStandardRange } from '../standard/show-standard-range.ts'
import { WORD_SEPARATOR } from './ask.constants.ts'

import type { StandardLogicalLine } from '../standard/standard-index.types.ts'
import type { RangeLine, RangeText, RangeTextOfParams } from './ask.types.ts'

/**
 * What a range of a file holds: its logical lines as `standard show` gives them (none for a range of noise, or one
 * the file does not hold), each cut to the original lines `from` to `to` (R1-9: a logical line running on past the
 * range reads the original lines inside it only, never the words beyond), and its count of non-noise original
 * lines, counted as K1 counts a slice.
 */
export function rangeTextOf(params: RangeTextOfParams): RangeText {
	const { file, from, to } = params
	const shown = showStandardRange({ file, from, to })
	return {
		lines:
			shown.kind === 'lines'
				? shown.lines.map((line) => lineInRange({ line, from, to, original: params.original }))
				: [],
		counted: countedLines({ from, to, noiseRanges: file.noiseRanges }),
	}
}

/** A logical line as the range holds it: whole when it lies inside, else the original lines of it inside the range. */
function lineInRange(params: {
	line: StandardLogicalLine
	from: number
	to: number
	original: readonly string[]
}): RangeLine {
	const { line } = params
	if (line.from >= params.from && line.to <= params.to)
		return { from: line.from, to: line.to, kind: line.kind, text: line.text }
	const first = Math.max(line.from, params.from)
	const last = Math.min(line.to, params.to)
	return {
		from: first,
		to: last,
		kind: line.kind,
		text: params.original.slice(first - 1, last).join(WORD_SEPARATOR),
	}
}
