import {
	VALUES_VOCABULARY,
	WORDLIKE_VOCABULARY,
} from '../../../../test/search-synthetic-standard.constants.ts'
import { findSynthetic, padded, singleFile } from '../../../../test/search-synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardVocabulary } from './standard-search.types.ts'

type Hit = { clause: string | null; terms: string[] }

type TestCase = {
	blocks: SyntheticBlock[]
	vocabulary: StandardVocabulary
	query: string
	expected: Hit[]
}

function clauseWith(text: string): SyntheticBlock[] {
	return [
		{ kind: 'heading', number: '1', title: 'Alpha' },
		{ kind: 'raw', lines: [text] },
	]
}

function tableWith(rows: string[][]): SyntheticBlock[] {
	return [
		{ kind: 'heading', number: '1', title: 'Alpha' },
		{ kind: 'table', columns: ['Name', 'Value'], rows },
	]
}

describe('find: the enumeration values of the vocabulary', () => {
	const testCases: Record<string, TestCase> = {
		'a value of one character in a table cell equal to it → linked': {
			blocks: tableWith([['x', '1']]),
			vocabulary: VALUES_VOCABULARY,
			query: 'x',
			expected: [{ clause: '1', terms: ['x'] }],
		},
		'another value of one character in a table cell equal to it → linked': {
			blocks: tableWith([['y', '1']]),
			vocabulary: VALUES_VOCABULARY,
			query: 'y',
			expected: [{ clause: '1', terms: ['y'] }],
		},
		'a value of one character in a sentence → not linked': {
			blocks: clauseWith('Use x on the item.'),
			vocabulary: VALUES_VOCABULARY,
			query: 'x',
			expected: [],
		},
		'a value of one character written with an equal sign → not linked': {
			blocks: clauseWith('Use x="1" on the item.'),
			vocabulary: VALUES_VOCABULARY,
			query: 'x',
			expected: [],
		},
		'a value of one character written with an at sign → not linked': {
			blocks: clauseWith('Use @x on the item.'),
			vocabulary: VALUES_VOCABULARY,
			query: 'x',
			expected: [],
		},
		'a table cell holding the value in capitals → not linked, a name keeps its case': {
			blocks: tableWith([['X', '1']]),
			vocabulary: VALUES_VOCABULARY,
			query: 'x',
			expected: [],
		},
		'a table cell holding the value and other words → not linked': {
			blocks: tableWith([['x value', '1']]),
			vocabulary: VALUES_VOCABULARY,
			query: 'x',
			expected: [],
		},
		'a value with a capital written in a sentence, the query the value → linked': {
			blocks: clauseWith('Use Gammas on the item.'),
			vocabulary: VALUES_VOCABULARY,
			query: 'Gammas',
			expected: [{ clause: '1', terms: ['Gammas'] }],
		},
		'a value in the plural, the text holds its singular → not found, a value is never stemmed': {
			blocks: clauseWith('Use Gamma on the item.'),
			vocabulary: VALUES_VOCABULARY,
			query: 'Gammas',
			expected: [],
		},
		'a value with a capital, the text holds it in lower case → not found, a value keeps its case': {
			blocks: clauseWith('Use gammas on the item.'),
			vocabulary: VALUES_VOCABULARY,
			query: 'Gammas',
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
})

describe('find: a vocabulary name that is an ordinary word', () => {
	const testCases: Record<string, TestCase> = {
		'a lowercase attribute, the text holds its plural → found as a word': {
			blocks: clauseWith('The quills open slowly.'),
			vocabulary: WORDLIKE_VOCABULARY,
			query: 'quill',
			expected: [{ clause: '1', terms: ['quill'] }],
		},
		'a capitalised tag, the text holds it in lower case → not found, the name is exact': {
			blocks: clauseWith('The zorbex opens slowly.'),
			vocabulary: WORDLIKE_VOCABULARY,
			query: 'Zorbex',
			expected: [],
		},
		'a capitalised tag, the text holds it as written → linked': {
			blocks: clauseWith('The Zorbex opens slowly.'),
			vocabulary: WORDLIKE_VOCABULARY,
			query: 'Zorbex',
			expected: [{ clause: '1', terms: ['Zorbex'] }],
		},
		'a lowercase attribute with an underscore and a digit, the text holds its plural → not found, the name is exact':
			{
				blocks: clauseWith('The quill_2s open slowly.'),
				vocabulary: WORDLIKE_VOCABULARY,
				query: 'quill_2',
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

	it('a lowercase attribute of two characters in a table cell equal to it → linked, a name under three characters stays exact', () => {
		expect(
			findSynthetic({
				standards: singleFile(tableWith([['qz', '1']])),
				vocabulary: { tags: [], attributes: ['qz'], values: [] },
				query: 'qz',
			}).map((slice): Hit => ({ clause: slice.clause, terms: slice.terms })),
		).toEqual([{ clause: '1', terms: ['qz'] }])
	})

	it('a lowercase attribute in a table cell equal to it → the score of a word (0.59), not of a cell link (1.18)', () => {
		expect(
			findSynthetic({
				standards: padded([
					{ kind: 'heading', number: '1', title: 'Alpha' },
					{ kind: 'table', columns: ['Name', 'Value'], rows: [['quill', '1']] },
				]),
				vocabulary: WORDLIKE_VOCABULARY,
				query: 'quill',
			}).map((slice) => ({ clause: slice.clause, score: slice.score })),
		).toEqual([{ clause: '1', score: 0.59 }])
	})
})
