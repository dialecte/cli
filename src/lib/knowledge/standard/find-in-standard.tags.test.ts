import {
	EMPTY_VOCABULARY,
	SYNTHETIC_VOCABULARY,
} from '../../../../test/search-synthetic-standard.constants.ts'
import { findSynthetic, singleFile } from '../../../../test/search-synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { StandardVocabulary } from '../../../../src/lib/knowledge/standard/standard-search.types.ts'
import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'

type Hit = { clause: string | null; terms: string[] }

type TestCase = {
	blocks: SyntheticBlock[]
	vocabulary?: StandardVocabulary
	query: string
	expected: Hit[]
}

function heading(number: string, title: string): SyntheticBlock {
	return { kind: 'heading', number, title }
}

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

function blank(): SyntheticBlock {
	return { kind: 'blank' }
}

/** A clause numbered 1 whose one text line is `text`. */
function clauseWith(text: string): SyntheticBlock[] {
	return [heading('1', 'Alpha'), raw(text)]
}

function tableWith(params: { columns: string[]; rows: string[][] }): SyntheticBlock[] {
	return [heading('1', 'Alpha'), { kind: 'table', columns: params.columns, rows: params.rows }]
}

const ONE_CLAUSE_HIT: Hit[] = [{ clause: '1', terms: ['D'] }]

/** Five units, each naming the tag `D` the one way the strengths tell apart, in an order that is not the ranking. */
const STRENGTH_BLOCKS: SyntheticBlock[] = [
	heading('1', 'Plain one'),
	raw('Element D appears.'),
	heading('2', 'Terms and definitions'),
	{ kind: 'definition', number: '2.1', term: 'Element D', layout: 'inline' },
	heading('3', 'Cells'),
	{ kind: 'caption', word: 'table', number: '1', title: 'Sample values' },
	{ kind: 'table', columns: ['Name', 'Value'], rows: [['D', '1']] },
	heading('4', 'Captioned'),
	{ kind: 'caption', word: 'table', number: '2', title: 'Details of D' },
	{ kind: 'table', columns: ['Name', 'Value'], rows: [['x', '1']] },
	heading('5', 'Overview of D'),
]

/** A tag named in seven lines of one clause, and the same tag in the heading of the clause after it. */
const STRONGEST_ONLY_BLOCKS: SyntheticBlock[] = [
	heading('1', 'Plain one'),
	...Array.from({ length: 7 }, (): SyntheticBlock[] => [raw('Element D appears.'), blank()]).flat(),
	heading('2', 'Overview of D'),
]

describe('find: the tag links', () => {
	const testCases: Record<string, TestCase> = {
		'a tag written alone in a sentence → linked': {
			blocks: clauseWith('Element D is used.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			expected: ONE_CLAUSE_HIT,
		},
		'a tag followed by a comma → linked': {
			blocks: clauseWith('Use D, then stop.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			expected: ONE_CLAUSE_HIT,
		},
		'a short tag inside a longer name → not linked': {
			blocks: clauseWith('Element DD_1 is used.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			expected: [],
		},
		'the longer name written alone → linked to its own name': {
			blocks: clauseWith('Element DD_1 is used.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'DD_1',
			expected: [{ clause: '1', terms: ['DD_1'] }],
		},
		'another short tag inside a longer name → not linked': {
			blocks: clauseWith('Element AA_1 is used.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'A',
			expected: [],
		},
		'the other longer name written alone → linked to its own name': {
			blocks: clauseWith('Element AA_1 is used.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'AA_1',
			expected: [{ clause: '1', terms: ['AA_1'] }],
		},
		'a short tag at the start of an ordinary word → not linked': {
			blocks: clauseWith('Element Delta is used.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			expected: [],
		},
		'a short tag followed by an underscore and a letter → not linked': {
			blocks: clauseWith('Element D_x is used.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			expected: [],
		},
		'a lower case letter the tag spells → not linked': {
			blocks: clauseWith('Element d is used.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			expected: [],
		},
		'a longer name written in lower case, the query the name as declared → not linked': {
			blocks: clauseWith('Element dd_1 is used.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'DD_1',
			expected: [],
		},
		'no dialecte installed, a short tag written in a sentence → nothing': {
			blocks: clauseWith('Element D is used.'),
			vocabulary: EMPTY_VOCABULARY,
			query: 'D',
			expected: [],
		},
		'no dialecte installed, a name of four characters → found as a word': {
			blocks: clauseWith('Element DD_1 is used.'),
			vocabulary: EMPTY_VOCABULARY,
			query: 'DD_1',
			expected: [{ clause: '1', terms: ['DD_1'] }],
		},
		'an attribute written with an at sign → linked': {
			blocks: clauseWith('Set @a on the item.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'a',
			expected: [{ clause: '1', terms: ['a'] }],
		},
		'an attribute written with an equal sign → linked': {
			blocks: clauseWith('Use a="1" on the item.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'a',
			expected: [{ clause: '1', terms: ['a'] }],
		},
		'the article a in a sentence → not linked': {
			blocks: clauseWith('This is a valve.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'a',
			expected: [],
		},
		'a table cell equal to an attribute name → linked': {
			blocks: tableWith({ columns: ['Name', 'Value'], rows: [['a', '1']] }),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'a',
			expected: [{ clause: '1', terms: ['a'] }],
		},
		'a table cell holding the article a before a word → not linked': {
			blocks: tableWith({ columns: ['Name', 'Value'], rows: [['a value', '1']] }),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'a',
			expected: [],
		},
		'another attribute written with an at sign, the query the first attribute → nothing': {
			blocks: clauseWith('Set @b on the item.'),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'a',
			expected: [],
		},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			expect(
				findSynthetic({
					standards: singleFile(testCase.blocks),
					vocabulary: testCase.vocabulary,
					query: testCase.query,
				}).map((slice): Hit => ({ clause: slice.clause, terms: slice.terms })),
			).toEqual(testCase.expected)
		})
	}

	it('a tag named by text, a definition term, a table cell, a table caption and a heading → the caption and heading hits first (doubled), the others tied, in file order', () => {
		expect(
			findSynthetic({
				standards: singleFile(STRENGTH_BLOCKS),
				vocabulary: SYNTHETIC_VOCABULARY,
				query: 'D',
			}).map((slice) => slice.clause),
		).toEqual(['4', '5', '1', '2', '3'])
	})

	it('a tag named in seven text lines of a clause and in the heading of another → the heading unit first, its title hit doubled', () => {
		expect(
			findSynthetic({
				standards: singleFile(STRONGEST_ONLY_BLOCKS),
				vocabulary: SYNTHETIC_VOCABULARY,
				query: 'D',
			}).map((slice) => slice.clause),
		).toEqual(['2', '1'])
	})
})
