import { findSynthetic, singleFile } from '../../../../test/search-synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'

type Hit = { from: number; to: number }

type TestCase = {
	/** The lines under the one heading (line 1); the first is line 2. */
	lines: string[]
	query: string
	expected: Hit[]
}

const SOFT_HYPHEN = '­'
const FI_LIGATURE = 'ﬁ'
const NON_BREAKING_SPACE = ' '
const EN_DASH = '–'

function blocksOf(lines: string[]): SyntheticBlock[] {
	return [
		{ kind: 'heading', number: '1', title: 'Alpha' },
		{ kind: 'raw', lines },
	]
}

describe('find: the word index', () => {
	const testCases: Record<string, TestCase> = {
		'the text holds a plural, the query its singular → found': {
			lines: ['The valves open slowly.'],
			query: 'valve',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a singular, the query its plural → found': {
			lines: ['The valve opens slowly.'],
			query: 'valves',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word in ies, the query its y form → found': {
			lines: ['The entries are sorted.'],
			query: 'entry',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word in ies, the query its ie form → not found': {
			lines: ['The entries are sorted.'],
			query: 'entrie',
			expected: [],
		},
		'the text holds a word in xes, the query its x form → found': {
			lines: ['The boxes are sorted.'],
			query: 'box',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word in xes, the query its xe form → found, a final e is dropped from a word of four characters':
			{
				lines: ['The boxes are sorted.'],
				query: 'boxe',
				expected: [{ from: 2, to: 2 }],
			},
		'the text holds a word in ches, the query its ch form → found': {
			lines: ['The matches are sorted.'],
			query: 'match',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word in shes, the query its sh form → found': {
			lines: ['The dishes are sorted.'],
			query: 'dish',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word in zes, the query its z form → found': {
			lines: ['The buzzes are sorted.'],
			query: 'buzz',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word in ses, the query its s form → found': {
			lines: ['The gases are sorted.'],
			query: 'gas',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word in ss, the query without the last s → not found': {
			lines: ['The class is sorted.'],
			query: 'clas',
			expected: [],
		},
		'the text holds a word in us, the query without the last s → not found': {
			lines: ['The bonus is sorted.'],
			query: 'bonu',
			expected: [],
		},
		'the text holds a word in is, the query without the last s → not found': {
			lines: ['The analysis is sorted.'],
			query: 'analysi',
			expected: [],
		},
		'the text holds a word in ss, the same word queried → found': {
			lines: ['The class is sorted.'],
			query: 'class',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a camel case word, the query its first part → found': {
			lines: ['The DataObject opens slowly.'],
			query: 'data',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a camel case word, the query its last part → found': {
			lines: ['The DataObject opens slowly.'],
			query: 'object',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a camel case word, the query the whole word in lower case → found': {
			lines: ['The DataObject opens slowly.'],
			query: 'dataobject',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a camel case word, the query the whole word as written → found': {
			lines: ['The DataObject opens slowly.'],
			query: 'DataObject',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds two words, the query their camel case join → not found': {
			lines: ['The data object opens slowly.'],
			query: 'DataObject',
			expected: [],
		},
		'the text holds an underscore word, the query its first part → found': {
			lines: ['The data_object opens slowly.'],
			query: 'data',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds an underscore word, the query its last part → found': {
			lines: ['The data_object opens slowly.'],
			query: 'object',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds an underscore word, the query the whole word → found': {
			lines: ['The data_object opens slowly.'],
			query: 'data_object',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds two words, the query their underscore join → not found': {
			lines: ['The data object opens slowly.'],
			query: 'data_object',
			expected: [],
		},
		'the text holds a name with a number, the query its lower case form → found': {
			lines: ['The AA_1 element opens slowly.'],
			query: 'aa_1',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word in capitals, the query lower case → found': {
			lines: ['The PLINK opens slowly.'],
			query: 'plink',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word in lower case, the query in capitals → found': {
			lines: ['The plink opens slowly.'],
			query: 'PLINK',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word in capitals whose lower case form is stemmed, the query lower case → not found, an all-capital word is an acronym':
			{
				lines: ['The ZORBLE opens slowly.'],
				query: 'zorble',
				expected: [],
			},
		'the query is a stop word the text holds → nothing': {
			lines: ['The valve opens slowly.'],
			query: 'the',
			expected: [],
		},
		'the query is another stop word the text holds → nothing': {
			lines: ['The valve and the pump open slowly.'],
			query: 'and',
			expected: [],
		},
		'the query is a stop word and a word the text holds → the word only is a term': {
			lines: ['The valve opens slowly.'],
			query: 'the valve',
			expected: [{ from: 2, to: 2 }],
		},
		'the query is a two character word the text holds → nothing': {
			lines: ['The ox opens slowly.'],
			query: 'ox',
			expected: [],
		},
		'the query is a two character word and a word the text holds → the word only is a term': {
			lines: ['The ox valve opens slowly.'],
			query: 'ox valve',
			expected: [{ from: 2, to: 2 }],
		},
		'the query is a three character word the text holds → found': {
			lines: ['The ant walks slowly.'],
			query: 'ant',
			expected: [{ from: 2, to: 2 }],
		},
		'the query is a number of two digits the text holds → nothing': {
			lines: ['The item 12 opens slowly.'],
			query: '12',
			expected: [],
		},
		'the query is a word no line holds → nothing': {
			lines: ['The valve opens slowly.'],
			query: 'pump',
			expected: [],
		},
		'the query is empty → nothing': {
			lines: ['The valve opens slowly.'],
			query: '',
			expected: [],
		},
		'the text holds a ligature, the query the plain letters → found': {
			lines: [`The ${FI_LIGATURE}nal valve opens slowly.`],
			query: 'final',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a word hyphenated across two lines, the query the whole word → found': {
			lines: ['The trans-', 'mission opens slowly.'],
			query: 'transmission',
			expected: [{ from: 2, to: 3 }],
		},
		'the text holds a soft hyphen inside a word, the query the whole word → found': {
			lines: [`The trans${SOFT_HYPHEN}mission opens slowly.`],
			query: 'transmission',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds a non breaking space between two words, the query the second → found': {
			lines: [`The alpha${NON_BREAKING_SPACE}beta opens slowly.`],
			query: 'beta',
			expected: [{ from: 2, to: 2 }],
		},
		'the text holds an en dash between two words, the query the second → found': {
			lines: [`The alpha${EN_DASH}beta opens slowly.`],
			query: 'beta',
			expected: [{ from: 2, to: 2 }],
		},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			expect(
				findSynthetic({
					standards: singleFile(blocksOf(testCase.lines)),
					query: testCase.query,
				}).map((slice): Hit => ({ from: slice.from, to: slice.to })),
			).toEqual(testCase.expected)
		})
	}

	it('the query holds a stop word, a two character word and a word the text holds → only the word is a term', () => {
		expect(
			findSynthetic({
				standards: singleFile(blocksOf(['The ox valve opens slowly.'])),
				query: 'the ox valve',
			}).map((slice) => slice.terms),
		).toEqual([['valve']])
	})
})
