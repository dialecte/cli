import type { LineBreakRow } from './questions-line-breaks.types.ts'

/** The questions whose options or station hold a line feed, a CRLF or a lone CR. */
export const LINE_BREAK_ROWS: LineBreakRow[] = [
	{ title: 'an option with a line feed', overrides: { options: ['accept', 'fix\nit'] } },
	{ title: 'an option with a CRLF', overrides: { options: ['accept', 'fix\r\nit'] } },
	{ title: 'an option with a lone CR', overrides: { options: ['accept', 'fix\rit'] } },
	{ title: 'a station with a line feed', overrides: { station: 'test-reviewer\nnext: x' } },
	{ title: 'a station with a CRLF', overrides: { station: 'test-reviewer\r\nnext: x' } },
	{ title: 'a station with a lone CR', overrides: { station: 'test-reviewer\rnext: x' } },
]
