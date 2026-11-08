import { codeLines, findSynthetic, padded } from '../../../../test/search-synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardSlice } from './standard-search.types.ts'

type TestCase = {
	blocks: SyntheticBlock[]
	query: string
	pinned: (keyof StandardSlice)[]
	expected: Partial<StandardSlice>[]
}

const FILLER_CODE_LINE = 'filler'
const QUERY = 'zorbit yak quillon'

function heading(number: string, title: string): SyntheticBlock {
	return { kind: 'heading', number, title }
}

/**
 * The code lines of a clause numbered 1 whose heading is line 1: line `n` of the file holds `hits[n]` when it
 * names one, else a filler; the last line is `lastLine`. One logical line per line.
 */
function clauseWithHits(params: {
	lastLine: number
	hits: Record<number, string>
}): SyntheticBlock[] {
	return [
		heading('1', 'Alpha'),
		...codeLines(
			Array.from(
				{ length: params.lastLine - 1 },
				(_unused, index) => params.hits[index + 2] ?? FILLER_CODE_LINE,
			),
		),
	]
}

/** A table under a caption (caption line 2, header row 3, separator 4, row `n` on line `n + 4`) holding `hits` by row. */
function tableWithHits(params: { rows: number; hits: Record<number, string> }): SyntheticBlock[] {
	return [
		heading('1', 'Alpha'),
		{ kind: 'caption', word: 'table', number: '1', title: 'Sample values' },
		{
			kind: 'table',
			columns: ['Name', 'Value'],
			rows: Array.from({ length: params.rows }, (_unused, index) => [
				params.hits[index + 1] ?? FILLER_CODE_LINE,
				'1',
			]),
		},
	]
}

describe('find: the window of a unit', () => {
	const testCases: Record<string, TestCase> = {
		'a clause of 95 lines, one hit at line 2 and the three query terms in lines 80 to 82 → the slice is the dense run, the score is the whole clause score':
			{
				blocks: clauseWithHits({
					lastLine: 95,
					hits: { 2: 'zorbit', 80: 'yak', 81: 'quillon', 82: 'zorbit' },
				}),
				query: QUERY,
				pinned: ['from', 'to', 'score', 'terms'],
				expected: [{ from: 80, to: 82, score: 1.66, terms: ['zorbit', 'yak', 'quillon'] }],
			},
		'two runs of the two same terms, 70 lines apart, a hit of another term at line 2 → from the first hit of the earlier run, 60 lines counted':
			{
				blocks: clauseWithHits({
					lastLine: 141,
					hits: { 2: 'zorbit', 70: 'yak', 71: 'quillon', 140: 'yak', 141: 'quillon' },
				}),
				query: QUERY,
				pinned: ['from', 'to'],
				expected: [{ from: 70, to: 129 }],
			},
		'two common words in the first 40 lines, one rare word at line 120 → the rare word wins, the sum of contributions over the count of terms':
			{
				blocks: clauseWithHits({
					lastLine: 130,
					hits: {
						...Object.fromEntries(
							Array.from({ length: 40 }, (_unused, index): [number, string] => [
								index + 2,
								index % 2 === 0 ? 'brindle' : 'quarrel',
							]),
						),
						120: 'quillon',
					},
				}),
				query: 'brindle quarrel quillon',
				pinned: ['from', 'to'],
				expected: [{ from: 120, to: 120 }],
			},
		'one term in three lines at the start, two other terms in two lines 80 lines later → the two distinct terms win over the repeated one':
			{
				blocks: clauseWithHits({
					lastLine: 90,
					hits: { 2: 'zorbit', 3: 'zorbit', 4: 'zorbit', 80: 'yak', 81: 'quillon' },
				}),
				query: QUERY,
				pinned: ['from', 'to'],
				expected: [{ from: 80, to: 81 }],
			},
		'a hit at line 2 and two terms 30 lines apart from line 80 → the window from the first of the two to the last, filler lines inside it':
			{
				blocks: clauseWithHits({
					lastLine: 120,
					hits: { 2: 'zorbit', 80: 'yak', 110: 'quillon' },
				}),
				query: QUERY,
				pinned: ['from', 'to'],
				expected: [{ from: 80, to: 110 }],
			},
		'two windows whose sums differ below the score decimals (0.9488 and 0.9530, both 0.95) → the earlier window wins the tie':
			{
				blocks: clauseWithHits({
					lastLine: 110,
					hits: {
						2: 'zorbit',
						3: 'quillon',
						4: 'quillon',
						5: 'quillon',
						6: 'quillon',
						7: 'quillon',
						100: 'yak',
						101: 'yak',
						102: 'brindle',
						103: 'brindle',
					},
				}),
				query: 'zorbit quillon yak brindle',
				pinned: ['from', 'to'],
				expected: [{ from: 2, to: 61 }],
			},
		'a table of 100 rows, a hit in row 1 and two terms in rows 85 and 86 → the slice starts at the dense window, not at the caption':
			{
				blocks: tableWithHits({ rows: 100, hits: { 1: 'zorbit', 85: 'yak', 86: 'quillon' } }),
				query: QUERY,
				pinned: ['from', 'to'],
				expected: [{ from: 89, to: 90 }],
			},
		'a table of 30 rows, a hit in row 1 and two terms in rows 20 and 21 → the slice still starts at its caption, the window within 60 lines of it':
			{
				blocks: tableWithHits({ rows: 30, hits: { 1: 'zorbit', 20: 'yak', 21: 'quillon' } }),
				query: QUERY,
				pinned: ['from', 'to'],
				expected: [{ from: 2, to: 25 }],
			},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			expect(
				findSynthetic({
					standards: padded(testCase.blocks),
					query: testCase.query,
				}).map((slice) =>
					Object.fromEntries(testCase.pinned.map((field) => [field, slice[field]])),
				),
			).toEqual(testCase.expected)
		})
	}
})
