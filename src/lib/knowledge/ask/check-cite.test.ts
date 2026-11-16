import {
	GIVEN_POOR,
	QUOTE_NINE_WORDS_UPPER,
	QUOTE_SEVEN_WORDS_ABSENT,
	ROW_TEXT_WITH_PIPES,
	CODE_TEXT,
	FORTY_ONE_WORDS,
	GIVEN_DIRECT,
	GIVEN_ELSEWHERE,
	GIVEN_LINKED,
	QUOTE_NINE_WORDS,
	QUOTE_REORDERED,
	QUOTE_COMPOUND_WHOLE,
	QUOTE_SPLIT_BY_NEWLINE,
	QUOTE_SPLIT_BY_SPACE,
	RANGE_COMPOUND_FIRST_HALF,
	RANGE_COMPOUND_SECOND_HALF,
	QUOTE_WITH_EN_DASH,
	QUOTE_WITH_LIGATURE,
	QUOTE_WITH_NON_BREAKING_SPACES,
	RANGE_FIRST_HALF,
	RANGE_HOLDING_NINE_WORDS,
	RANGE_SECOND_HALF,
	RANGE_WITH_FIELD,
	RANGE_WITH_HYPHEN,
	REPORT_CURRENT_MOVED,
	REPORT_OTHER_FILE,
	ROW_TEXT,
	ROW_TEXT_LONGER,
} from '../../../../test/ask-report-fixtures.constants.ts'
import { citeContextOf, citeOf, proseLineOf } from '../../../../test/ask-report-fixtures.ts'
import { checkCite } from './check-cite.ts'

import { describe, expect, it } from 'vitest'

import type { CiteContext, RangeLine, ReportCite } from './ask.types.ts'

type CiteRow = { cite: ReportCite; context: CiteContext; expected: Record<string, unknown> }

const NINE_WORD_LINE = proseLineOf({ text: RANGE_HOLDING_NINE_WORDS })

/** A quote of `count` words and the one prose line that holds it. */
function quoteOfWords(params: { count: number }): { quote: string; line: RangeLine } {
	const quote = FORTY_ONE_WORDS.slice(0, params.count).join(' ')
	return { quote, line: proseLineOf({ text: `${quote} and the rest` }) }
}

const SEVEN = quoteOfWords({ count: 7 })
const EIGHT = quoteOfWords({ count: 8 })
const FORTY = quoteOfWords({ count: 40 })
const FORTY_ONE = quoteOfWords({ count: 41 })

/** What a verified cite holds: the slice that covers it. */
function verified(slice: unknown): Record<string, unknown> {
	return { verified: true, slice }
}

/** What a refused cite holds: the reason. */
function refused(reason: string): Record<string, unknown> {
	return { verified: false, refused: reason }
}

describe('checkCite: the file and the range (the first failure wins)', () => {
	const rows: Record<string, CiteRow> = {
		'a file the manifest does not hold -> unknown-file': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, file: REPORT_OTHER_FILE }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: refused('unknown-file'),
		},
		'a file whose checksum moved since the ask -> file-changed': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS }),
			context: citeContextOf({ lines: [NINE_WORD_LINE], current: REPORT_CURRENT_MOVED }),
			expected: refused('file-changed'),
		},
		'from below 1 -> out-of-range': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 0, to: 13 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: refused('out-of-range'),
		},
		'from after to -> out-of-range': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 13, to: 12 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: refused('out-of-range'),
		},
		'to past the last line of the file (200) -> out-of-range': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 199, to: 201 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: refused('out-of-range'),
		},
		'a range of 41 non-noise lines -> range-too-wide': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS }),
			context: citeContextOf({ lines: [NINE_WORD_LINE], counted: 41 }),
			expected: refused('range-too-wide'),
		},
		'a range of exactly 40 non-noise lines passes that check': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS }),
			context: citeContextOf({ lines: [NINE_WORD_LINE], counted: 40 }),
			expected: verified(GIVEN_DIRECT),
		},
		'a range too wide and also not given -> range-too-wide (the range check comes first)': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 31, to: 31 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE], counted: 41 }),
			expected: refused('range-too-wide'),
		},
		'a missing file wins over an out-of-range range': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, file: REPORT_OTHER_FILE, from: 0, to: 0 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: refused('unknown-file'),
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkCite({ cite: row.cite, context: row.context })).toMatchObject(row.expected)
		})
})

describe('checkCite: the range lies inside a slice given to this reader (case 27)', () => {
	const rows: Record<string, CiteRow> = {
		'a range inside a direct given slice -> verified with that slice': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 12, to: 13 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: verified(GIVEN_DIRECT),
		},
		'28: a range inside a given slice of a poor block -> verified, keeping that slice (quality poor)':
			{
				cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 12, to: 13 }),
				context: citeContextOf({ lines: [NINE_WORD_LINE], given: [GIVEN_POOR] }),
				expected: verified(GIVEN_POOR),
			},
		'a range inside a linked given slice -> verified with that slice (27)': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 105, to: 106 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE], given: [GIVEN_DIRECT, GIVEN_LINKED] }),
			expected: verified(GIVEN_LINKED),
		},
		'a range one line past a given slice end -> not-given': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 31, to: 31 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: refused('not-given'),
		},
		'a range starting inside a slice and ending one line past it -> not-given': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 29, to: 31 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: refused('not-given'),
		},
		'one line past a linked slice end (one hop further) -> not-given': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 121, to: 121 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE], given: [GIVEN_DIRECT, GIVEN_LINKED] }),
			expected: refused('not-given'),
		},
		'a range of the right lines in a slice of another file -> not-given': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS, from: 12, to: 13 }),
			context: citeContextOf({ lines: [NINE_WORD_LINE], given: [GIVEN_ELSEWHERE] }),
			expected: refused('not-given'),
		},
		'no slice given at all -> not-given': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS }),
			context: citeContextOf({ lines: [NINE_WORD_LINE], given: [] }),
			expected: refused('not-given'),
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkCite({ cite: row.cite, context: row.context })).toMatchObject(row.expected)
		})
})

describe('checkCite: the quote is found after folding (ligatures, spaces, dashes, hyphenation)', () => {
	const rows: Record<string, CiteRow> = {
		'the exact words of the range -> verified': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: verified(GIVEN_DIRECT),
		},
		'a word split by a hyphen and a space (exam- ple) matches example': {
			cite: citeOf({ quote: QUOTE_SPLIT_BY_SPACE }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: verified(GIVEN_DIRECT),
		},
		'a word split by a hyphen and a newline (exam-, ple) matches example': {
			cite: citeOf({ quote: QUOTE_SPLIT_BY_NEWLINE }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: verified(GIVEN_DIRECT),
		},
		'a range whose word is hyphenated across two of its lines matches the whole word quoted': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS }),
			context: citeContextOf({
				lines: [
					proseLineOf({ text: RANGE_FIRST_HALF, from: 12 }),
					proseLineOf({ text: RANGE_SECOND_HALF, from: 13 }),
				],
			}),
			expected: verified(GIVEN_DIRECT),
		},
		'a compound split across two lines of the range (non-, empty) matches the compound quoted whole (non-empty)':
			{
				cite: citeOf({ quote: QUOTE_COMPOUND_WHOLE }),
				context: citeContextOf({
					lines: [
						proseLineOf({ text: RANGE_COMPOUND_FIRST_HALF, from: 12 }),
						proseLineOf({ text: RANGE_COMPOUND_SECOND_HALF, from: 13 }),
					],
				}),
				expected: verified(GIVEN_DIRECT),
			},
		'a ligature in the quote matches the plain letters of the range': {
			cite: citeOf({ quote: QUOTE_WITH_LIGATURE }),
			context: citeContextOf({ lines: [proseLineOf({ text: RANGE_WITH_FIELD })] }),
			expected: verified(GIVEN_DIRECT),
		},
		'non-breaking spaces in the quote match plain spaces': {
			cite: citeOf({ quote: QUOTE_WITH_NON_BREAKING_SPACES }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: verified(GIVEN_DIRECT),
		},
		'an en dash in the quote matches a hyphen of the range': {
			cite: citeOf({ quote: QUOTE_WITH_EN_DASH }),
			context: citeContextOf({ lines: [proseLineOf({ text: RANGE_WITH_HYPHEN })] }),
			expected: verified(GIVEN_DIRECT),
		},
		'a quote in another letter case than the range -> verified': {
			cite: citeOf({ quote: QUOTE_NINE_WORDS_UPPER }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: verified(GIVEN_DIRECT),
		},
		'a quote of 7 words the range does not hold -> quote-not-found (found is checked before length)':
			{
				cite: citeOf({ quote: QUOTE_SEVEN_WORDS_ABSENT }),
				context: citeContextOf({ lines: [NINE_WORD_LINE] }),
				expected: refused('quote-not-found'),
			},
		'the same words in another order -> quote-not-found': {
			cite: citeOf({ quote: QUOTE_REORDERED }),
			context: citeContextOf({ lines: [NINE_WORD_LINE] }),
			expected: refused('quote-not-found'),
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkCite({ cite: row.cite, context: row.context })).toMatchObject(row.expected)
		})
})

describe('checkCite: the quote is 8 to 40 words, or one whole table row or code line', () => {
	const tableLine: RangeLine = { from: 12, to: 12, kind: 'table', text: ROW_TEXT }
	const codeLine: RangeLine = { from: 12, to: 12, kind: 'code', text: CODE_TEXT }
	const proseLine: RangeLine = { from: 12, to: 12, kind: 'prose', text: CODE_TEXT }
	const longerTableLine: RangeLine = { from: 12, to: 12, kind: 'table', text: ROW_TEXT_LONGER }
	const rows: Record<string, CiteRow> = {
		'a quote of 7 words -> quote-length': {
			cite: citeOf({ quote: SEVEN.quote }),
			context: citeContextOf({ lines: [SEVEN.line] }),
			expected: refused('quote-length'),
		},
		'a quote of 8 words -> verified': {
			cite: citeOf({ quote: EIGHT.quote }),
			context: citeContextOf({ lines: [EIGHT.line] }),
			expected: verified(GIVEN_DIRECT),
		},
		'a quote of 40 words -> verified': {
			cite: citeOf({ quote: FORTY.quote }),
			context: citeContextOf({ lines: [FORTY.line] }),
			expected: verified(GIVEN_DIRECT),
		},
		'a quote of 41 words -> quote-length': {
			cite: citeOf({ quote: FORTY_ONE.quote }),
			context: citeContextOf({ lines: [FORTY_ONE.line] }),
			expected: refused('quote-length'),
		},
		'3 words equal to one whole table row of the range -> verified': {
			cite: citeOf({ quote: ROW_TEXT }),
			context: citeContextOf({
				lines: [proseLineOf({ text: NINE_WORD_LINE.text, from: 11 }), tableLine],
			}),
			expected: verified(GIVEN_DIRECT),
		},
		'3 words equal to one whole code line of the range -> verified': {
			cite: citeOf({ quote: CODE_TEXT }),
			context: citeContextOf({ lines: [codeLine] }),
			expected: verified(GIVEN_DIRECT),
		},
		'3 plain words equal to a table row written with pipes -> verified': {
			cite: citeOf({ quote: ROW_TEXT }),
			context: citeContextOf({
				lines: [{ from: 12, to: 12, kind: 'table', text: ROW_TEXT_WITH_PIPES }],
			}),
			expected: verified(GIVEN_DIRECT),
		},
		'3 words of a prose line, even the whole line -> quote-length': {
			cite: citeOf({ quote: CODE_TEXT }),
			context: citeContextOf({ lines: [proseLine] }),
			expected: refused('quote-length'),
		},
		'3 words that are only the start of a longer table row -> quote-length': {
			cite: citeOf({ quote: ROW_TEXT }),
			context: citeContextOf({ lines: [longerTableLine] }),
			expected: refused('quote-length'),
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkCite({ cite: row.cite, context: row.context })).toMatchObject(row.expected)
		})
})
