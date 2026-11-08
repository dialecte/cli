import { logicalLinesIn } from './logical-lines-in.ts'

import type { ShowStandardRangeParams, StandardShowAnswer } from './standard-search.types.ts'

/**
 * The logical lines overlapping a range of original lines of a file, whole; nothing when the range
 * holds only noise or blank lines; refused when the range is reversed or ends after the file's last line.
 */
export function showStandardRange(params: ShowStandardRangeParams): StandardShowAnswer {
	const { file, from, to } = params
	if (from > to) return { kind: 'refused', reason: 'from-after-to' }
	if (to > file.lineCount) return { kind: 'refused', reason: 'beyond-last-line' }
	const lines = logicalLinesIn({ file, from, to })
	return lines.length === 0 ? { kind: 'nothing' } : { kind: 'lines', lines }
}
