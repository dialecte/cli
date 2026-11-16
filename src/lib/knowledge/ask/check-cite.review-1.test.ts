/**
 * Review round 1, R1-1: a quote matches the range on word boundaries only. A quote ending or starting inside a word
 * of the range is not in it.
 */
import { citeContextOf, citeOf, proseLineOf } from '../../../../test/ask-report-fixtures.ts'
import {
	QUOTE_ENDING_INSIDE_A_WORD,
	QUOTE_STARTING_INSIDE_A_WORD,
	RANGE_ENDING_INSIDE_A_WORD,
	RANGE_STARTING_INSIDE_A_WORD,
} from '../../../../test/ask-review-1-fixtures.constants.ts'
import { checkCite } from './check-cite.ts'

import { describe, expect, it } from 'vitest'

import type { CiteContext, ReportCite } from './ask.types.ts'

type BoundaryRow = { cite: ReportCite; context: CiteContext; expected: Record<string, unknown> }

describe('checkCite: the quote lies on word boundaries of the range', () => {
	const rows: Record<string, BoundaryRow> = {
		'a quote ending inside a word of the range (AA_1 in AA_10) -> quote-not-found': {
			cite: citeOf({ quote: QUOTE_ENDING_INSIDE_A_WORD }),
			context: citeContextOf({ lines: [proseLineOf({ text: RANGE_ENDING_INSIDE_A_WORD })] }),
			expected: { verified: false, refused: 'quote-not-found' },
		},
		'a quote starting inside a word of the range (bounded in unbounded) -> quote-not-found': {
			cite: citeOf({ quote: QUOTE_STARTING_INSIDE_A_WORD }),
			context: citeContextOf({ lines: [proseLineOf({ text: RANGE_STARTING_INSIDE_A_WORD })] }),
			expected: { verified: false, refused: 'quote-not-found' },
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkCite({ cite: row.cite, context: row.context })).toMatchObject(row.expected)
		})
})
