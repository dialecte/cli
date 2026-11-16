import { RANGE_LINE_D_POSITIVE, RANGE_LINE_D_SHALL_NOT } from './ask-report-fixtures.constants.ts'
import { citeContextOf, proseLineOf } from './ask-report-fixtures.ts'

/** The range every report cite points at: one prose line holding the baseline quote, inside the slice given. */
export const DEFAULT_REPORT_CITES = citeContextOf({
	lines: [proseLineOf({ text: RANGE_LINE_D_POSITIVE })],
})

/** The same range holding the negating quote. */
export const NEGATING_REPORT_CITES = citeContextOf({
	lines: [proseLineOf({ text: RANGE_LINE_D_SHALL_NOT })],
})
