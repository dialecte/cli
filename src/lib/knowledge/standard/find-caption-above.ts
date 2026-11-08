import { parseCaption } from './parse-caption.ts'
import { CAPTION_LOOKBACK_LINES } from './standard-index.constants.ts'

import type { StandardLogicalLine } from './standard-index.types.ts'

/**
 * The index of the caption of the table whose first row is the logical line `start`: the nearest table
 * caption within the lookback above it. The search stops at a table line, so a caption belongs to the
 * first table below it only. Null when there is none.
 */
export function findCaptionAbove(params: {
	logicalLines: StandardLogicalLine[]
	start: number
}): number | null {
	const { logicalLines, start } = params
	const first = Math.max(0, start - CAPTION_LOOKBACK_LINES)
	for (let index = start - 1; index >= first; index--) {
		const line = logicalLines[index]
		if (line.kind === 'table') return null
		if (line.kind !== 'caption') continue
		if (parseCaption(line.text)?.word === 'table') return index
	}
	return null
}
