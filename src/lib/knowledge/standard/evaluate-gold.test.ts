import { indexSyntheticFile } from '../../../../test/search-synthetic-standard.ts'
import { SYNTHETIC_FILE_ID } from '../../../../test/synthetic-standard.constants.ts'
import { evaluateGold } from './evaluate-gold.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type {
	StandardEvaluation,
	StandardGoldItem,
	StandardSlice,
} from './standard-search.types.ts'

type TestCase = {
	items: StandardGoldItem[]
	/** The slices find answers per question, in rank order; a question without an entry gets none. */
	found: Record<string, StandardSlice[]>
	/** The wider find (limit 50) per question; the same as `found` when a case gives none. */
	foundWide?: Record<string, StandardSlice[]>
	expected: StandardEvaluation
}

const EVAL_FILE = SYNTHETIC_FILE_ID
const EN_DASH = '–'
const FI_LIGATURE = 'ﬁ'
const MISSING_FILE = 'synthetic/missing-9000-0'
const OTHER_FILE = 'synthetic/other-9000-0'

/**
 * Line 1 a heading, line 2 and line 4 prose, line 6 prose with a ligature, line 8 prose with a hyphen;
 * a blank line between each, so each prose line is a logical line of its own.
 */
const FILE_BLOCKS: SyntheticBlock[] = [
	{ kind: 'heading', number: '1', title: 'Alpha' },
	{ kind: 'raw', lines: ['The first rule says valves open.'] },
	{ kind: 'blank' },
	{ kind: 'raw', lines: ['The second rule says pumps stop.'] },
	{ kind: 'blank' },
	{ kind: 'raw', lines: [`The ${FI_LIGATURE}nal rule holds.`] },
	{ kind: 'blank' },
	{ kind: 'raw', lines: ['A high-level rule applies.'] },
]

function sliceOf(params: {
	from: number
	to: number
	linked?: boolean
	file?: string
}): StandardSlice {
	return {
		file: params.file ?? EVAL_FILE,
		from: params.from,
		to: params.to,
		clause: '1',
		title: 'Alpha',
		score: 1,
		terms: ['rule'],
		linked: params.linked ?? false,
	}
}

/** A slice that holds none of the quotes of the cases. */
const OTHER_LINE = sliceOf({ from: 8, to: 8 })
const VALVES_LINE = sliceOf({ from: 2, to: 2 })
const PUMPS_LINE = sliceOf({ from: 4, to: 4 })

/** `count` slices holding no quote, then `last`: `last` is at rank `count + 1`. */
function ranked(params: { before: number; last: StandardSlice }): StandardSlice[] {
	return [...Array.from({ length: params.before }, () => OTHER_LINE), params.last]
}

function item(params: { quote: string; file?: string; about?: string }): StandardGoldItem {
	return {
		question: 'question',
		about: params.about,
		expected: [{ file: params.file ?? EVAL_FILE, quote: params.quote }],
	}
}

function evaluated(params: Partial<StandardEvaluation>): StandardEvaluation {
	return { items: 1, notInText: 0, recallAt5: 0, recallAt10: 0, misses: [], ...params }
}

function missOf(params: { quote: string; why: string; file?: string; question?: string }) {
	return {
		question: params.question ?? 'question',
		file: params.file ?? EVAL_FILE,
		quote: params.quote,
		why: params.why,
	}
}

describe('eval: recall and the reason of each miss', () => {
	const testCases: Record<string, TestCase> = {
		'a quote in the first slice → found at rank 1': {
			items: [item({ quote: 'valves open' })],
			found: { question: [VALVES_LINE] },
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote in capitals, the text in lower case → found': {
			items: [item({ quote: 'VALVES OPEN' })],
			found: { question: [VALVES_LINE] },
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote with plain letters, the text with a ligature → found': {
			items: [item({ quote: 'the final rule holds' })],
			found: { question: [sliceOf({ from: 6, to: 6 })] },
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote with a ligature and a run of spaces, the text with plain letters → found': {
			items: [item({ quote: `the ${FI_LIGATURE}nal    rule holds` })],
			found: { question: [sliceOf({ from: 6, to: 6 })] },
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote with an en dash, the text with a hyphen → found': {
			items: [item({ quote: `high${EN_DASH}level rule` })],
			found: { question: [OTHER_LINE] },
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote across two logical lines, one slice holding both → found': {
			items: [item({ quote: 'valves open. The second rule' })],
			found: { question: [sliceOf({ from: 2, to: 4 })] },
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote across two logical lines, the slice holding the first only → not found by find': {
			items: [item({ quote: 'valves open. The second rule' })],
			found: { question: [VALVES_LINE] },
			expected: evaluated({
				misses: [missOf({ quote: 'valves open. The second rule', why: 'not found by find' })],
			}),
		},
		'a quote in the fifth slice → found within 5': {
			items: [item({ quote: 'valves open' })],
			found: { question: ranked({ before: 4, last: VALVES_LINE }) },
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote in the sixth slice → found within 10 only, not a miss': {
			items: [item({ quote: 'valves open' })],
			found: { question: ranked({ before: 5, last: VALVES_LINE }) },
			expected: evaluated({ recallAt5: 0, recallAt10: 1 }),
		},
		'a quote in the tenth slice → found within 10 only': {
			items: [item({ quote: 'valves open' })],
			found: { question: ranked({ before: 9, last: VALVES_LINE }) },
			expected: evaluated({ recallAt5: 0, recallAt10: 1 }),
		},
		'a quote in the eleventh slice → a miss ranked 11': {
			items: [item({ quote: 'valves open' })],
			found: { question: ranked({ before: 10, last: VALVES_LINE }) },
			expected: evaluated({ misses: [missOf({ quote: 'valves open', why: 'ranked 11' })] }),
		},
		'a quote the find of 10 does not give, the wider find ranks 12th → a miss ranked 12': {
			items: [item({ quote: 'valves open' })],
			found: { question: ranked({ before: 9, last: OTHER_LINE }) },
			foundWide: { question: ranked({ before: 11, last: VALVES_LINE }) },
			expected: evaluated({ misses: [missOf({ quote: 'valves open', why: 'ranked 12' })] }),
		},
		'a quote in a linked slice at rank 2 → found at rank 2': {
			items: [item({ quote: 'pumps stop' })],
			found: { question: [OTHER_LINE, sliceOf({ from: 4, to: 4, linked: true })] },
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote in the lines of a slice of another file → not found by find': {
			items: [item({ quote: 'valves open' })],
			found: { question: [sliceOf({ from: 2, to: 2, file: OTHER_FILE })] },
			expected: evaluated({ misses: [missOf({ quote: 'valves open', why: 'not found by find' })] }),
		},
		'an expected file no file of the standard has → a miss, unknown file': {
			items: [item({ quote: 'valves open', file: MISSING_FILE })],
			found: { question: [VALVES_LINE] },
			expected: evaluated({
				misses: [
					missOf({ quote: 'valves open', file: MISSING_FILE, why: `unknown file ${MISSING_FILE}` }),
				],
			}),
		},
		'a quote the file does not hold → a miss, not in the text': {
			items: [item({ quote: 'turbines spin' })],
			found: { question: [VALVES_LINE] },
			expected: evaluated({ misses: [missOf({ quote: 'turbines spin', why: 'not in the text' })] }),
		},
		'an item with no expected quote and an item found → the first is not in the text and left out of the recall':
			{
				items: [
					{ question: 'none', expected: [] },
					{ question: 'question', expected: [{ file: EVAL_FILE, quote: 'valves open' }] },
				],
				found: { question: [VALVES_LINE] },
				expected: evaluated({ items: 1, notInText: 1, recallAt5: 1, recallAt10: 1 }),
			},
		'only items with no expected quote → nothing evaluated, both recalls 0': {
			items: [
				{ question: 'none', expected: [] },
				{ question: 'other', expected: [] },
			],
			found: {},
			expected: evaluated({ items: 0, notInText: 2 }),
		},
		'one item found and one not found → a recall of one half, the miss of the second': {
			items: [
				{ question: 'first', expected: [{ file: EVAL_FILE, quote: 'valves open' }] },
				{ question: 'second', expected: [{ file: EVAL_FILE, quote: 'pumps stop' }] },
			],
			found: { first: [VALVES_LINE], second: [VALVES_LINE] },
			expected: evaluated({
				items: 2,
				recallAt5: 0.5,
				recallAt10: 0.5,
				misses: [missOf({ question: 'second', quote: 'pumps stop', why: 'not found by find' })],
			}),
		},
		'an item with two quotes found at ranks 3 and 8 → found within 5, the best rank counts': {
			items: [
				{
					question: 'question',
					expected: [
						{ file: EVAL_FILE, quote: 'valves open' },
						{ file: EVAL_FILE, quote: 'pumps stop' },
					],
				},
			],
			found: {
				question: [
					OTHER_LINE,
					OTHER_LINE,
					VALVES_LINE,
					OTHER_LINE,
					OTHER_LINE,
					OTHER_LINE,
					OTHER_LINE,
					PUMPS_LINE,
				],
			},
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'an item with two quotes, one found and one not in the text → found, the alternatives count by their best rank':
			{
				items: [
					{
						question: 'question',
						expected: [
							{ file: EVAL_FILE, quote: 'valves open' },
							{ file: EVAL_FILE, quote: 'turbines spin' },
						],
					},
				],
				found: { question: [VALVES_LINE] },
				expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
			},
		'an item with two quotes, the first not in the text and the second found at rank 2 → found, recall 1':
			{
				items: [
					{
						question: 'question',
						expected: [
							{ file: EVAL_FILE, quote: 'turbines spin' },
							{ file: EVAL_FILE, quote: 'pumps stop' },
						],
					},
				],
				found: { question: [OTHER_LINE, PUMPS_LINE] },
				expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
			},
		'an item with two quotes found at ranks 3 and 12 → found within 5': {
			items: [
				{
					question: 'question',
					expected: [
						{ file: EVAL_FILE, quote: 'pumps stop' },
						{ file: EVAL_FILE, quote: 'valves open' },
					],
				},
			],
			found: {
				question: [
					OTHER_LINE,
					OTHER_LINE,
					VALVES_LINE,
					...Array.from({ length: 8 }, () => OTHER_LINE),
					PUMPS_LINE,
				],
			},
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'an item with two quotes missed, one not in the text and one ranked 11 → one miss, the reason of the best quote':
			{
				items: [
					{
						question: 'question',
						expected: [
							{ file: EVAL_FILE, quote: 'turbines spin' },
							{ file: EVAL_FILE, quote: 'pumps stop' },
						],
					},
				],
				found: { question: ranked({ before: 10, last: PUMPS_LINE }) },
				expected: evaluated({ misses: [missOf({ quote: 'pumps stop', why: 'ranked 11' })] }),
			},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			const wide = testCase.foundWide ?? testCase.found
			expect(
				evaluateGold({
					items: testCase.items,
					find: (params) => testCase.found[params.item.question] ?? [],
					findWide: (params) => wide[params.item.question] ?? [],
					files: [indexSyntheticFile({ file: { blocks: FILE_BLOCKS } })],
				}),
			).toEqual(testCase.expected)
		})
	}

	it('an item about a tag → the find is given the tag', () => {
		expect(
			evaluateGold({
				items: [item({ quote: 'valves open', about: 'D' })],
				find: (params) => (params.item.about === 'D' ? [VALVES_LINE] : []),
				findWide: (params) => (params.item.about === 'D' ? [VALVES_LINE] : []),
				files: [indexSyntheticFile({ file: { blocks: FILE_BLOCKS } })],
			}),
		).toEqual(evaluated({ recallAt5: 1, recallAt10: 1 }))
	})
})

/**
 * Line 1 a heading, line 2 prose with a bold run, line 3 blank, lines 4-5 a table header and its separator,
 * line 6 a row of two cells, line 7 a row with a line break inside a cell.
 */
const MARKUP_BLOCKS: SyntheticBlock[] = [
	{ kind: 'heading', number: '1', title: 'Alpha' },
	{ kind: 'raw', lines: ['The **valves** open.'] },
	{ kind: 'blank' },
	{
		kind: 'table',
		columns: ['Name', 'Value'],
		rows: [
			['alpha', 'beta'],
			['one<br>two', 'three'],
		],
	},
]

describe('eval: a quote in plain words matches the text without its markup', () => {
	const testCases: Record<
		string,
		{ quote: string; slice: StandardSlice[]; expected: StandardEvaluation }
	> = {
		'a quote of the words of a table row → found': {
			quote: 'alpha beta',
			slice: [sliceOf({ from: 6, to: 6 })],
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote of the plain words of a bold run → found': {
			quote: 'the valves open.',
			slice: [sliceOf({ from: 2, to: 2 })],
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote over a line break inside a cell → found': {
			quote: 'one two three',
			slice: [sliceOf({ from: 7, to: 7 })],
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a quote written with the heading marker → found': {
			quote: '## 1 Alpha',
			slice: [sliceOf({ from: 1, to: 1 })],
			expected: evaluated({ recallAt5: 1, recallAt10: 1 }),
		},
		'a plain-word quote of a table row that find does not give → not found by find, not "not in the text"':
			{
				quote: 'alpha beta',
				slice: [],
				expected: evaluated({
					misses: [missOf({ quote: 'alpha beta', why: 'not found by find' })],
				}),
			},
	}

	for (const [name, testCase] of Object.entries(testCases))
		it(name, () => {
			expect(
				evaluateGold({
					items: [item({ quote: testCase.quote })],
					find: () => testCase.slice,
					findWide: () => testCase.slice,
					files: [indexSyntheticFile({ file: { blocks: MARKUP_BLOCKS } })],
				}),
			).toEqual(testCase.expected)
		})
})
