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

const FOUND: Hit[] = [{ from: 2, to: 2 }]

function blocksOf(lines: string[]): SyntheticBlock[] {
	return [
		{ kind: 'heading', number: '1', title: 'Alpha' },
		{ kind: 'raw', lines },
	]
}

function hitsOf(testCase: TestCase): Hit[] {
	return findSynthetic({
		standards: singleFile(blocksOf(testCase.lines)),
		query: testCase.query,
	}).map((slice): Hit => ({ from: slice.from, to: slice.to }))
}

/** Words that must meet: the text holds the first, the query is the second. */
function metPair(params: { text: string; query: string }): [string, TestCase] {
	return [
		`the text holds "${params.text}", the query "${params.query}" → found`,
		{ lines: [`The ${params.text} unit opens slowly.`], query: params.query, expected: FOUND },
	]
}

/** Words that must stay apart: the text holds the first, the query is the second. */
function apartPair(params: { text: string; query: string }): [string, TestCase] {
	return [
		`the text holds "${params.text}", the query "${params.query}" → not found`,
		{ lines: [`The ${params.text} unit opens slowly.`], query: params.query, expected: [] },
	]
}

describe('find: acronyms', () => {
	const testCases: Record<string, TestCase> = {
		'the text holds an acronym in capitals ending in S, the query the same acronym → found': {
			lines: ['The QXS unit opens slowly.'],
			query: 'QXS',
			expected: FOUND,
		},
		'the text holds a plain word, the query an acronym that is the word plus S → not found': {
			lines: ['The qxv unit opens slowly.'],
			query: 'QXVS',
			expected: [],
		},
		'the text holds a plain word on one line and the acronym on another, the query the acronym → the acronym line only':
			{
				lines: ['The qxv unit opens slowly.', '', 'The QXVS unit opens slowly.'],
				query: 'QXVS',
				expected: [{ from: 4, to: 4 }],
			},
		'the text holds an acronym ending in S, the query the plain word without the S → not found': {
			lines: ['The QXVS unit opens slowly.'],
			query: 'qxv',
			expected: [],
		},
		'the text holds a two letter acronym, the query the same acronym → found': {
			lines: ['The QZ unit opens slowly.'],
			query: 'QZ',
			expected: FOUND,
		},
		'the text holds a two letter acronym, the query in lower case → nothing': {
			lines: ['The QZ unit opens slowly.'],
			query: 'qz',
			expected: [],
		},
		'the text holds a two letter word in lower case, the query the same word → nothing': {
			lines: ['The qz unit opens slowly.'],
			query: 'qz',
			expected: [],
		},
		'the text holds a two letter word in lower case, the query an acronym of its letters → not found':
			{
				lines: ['The qz unit opens slowly.'],
				query: 'QZ',
				expected: [],
			},
		'the text holds an acronym that is also a stop word, the query the acronym → found': {
			lines: ['The DO unit opens slowly.'],
			query: 'DO',
			expected: FOUND,
		},
		'the text holds a stop word in lower case, the query it in lower case → nothing': {
			lines: ['The do unit opens slowly.'],
			query: 'do',
			expected: [],
		},
		'the text holds an acronym with a digit, the query the same acronym → found': {
			lines: ['The QX0 unit opens slowly.'],
			query: 'QX0',
			expected: FOUND,
		},
		'the text holds one capital and a digit, the query the same two characters → nothing': {
			lines: ['The Q7 unit opens slowly.'],
			query: 'Q7',
			expected: [],
		},
		'the text holds an acronym ending in ED, the query the acronym → found, never stemmed': {
			lines: ['The QXZED unit opens slowly.'],
			query: 'QXZED',
			expected: FOUND,
		},
		'the text holds an acronym ending in ED, the query the word without the ED → not found': {
			lines: ['The QXZED unit opens slowly.'],
			query: 'qxz',
			expected: [],
		},
		'the text holds the plural of an acronym, the query the acronym → found': {
			lines: ['The QXDs unit opens slowly.'],
			query: 'QXD',
			expected: FOUND,
		},
		'the text holds an acronym, the query its plural → found': {
			lines: ['The QXD unit opens slowly.'],
			query: 'QXDs',
			expected: FOUND,
		},
		'the text holds the plural of an acronym, the query its first two letters → not found, no part is made':
			{
				lines: ['The QXDs unit opens slowly.'],
				query: 'QX',
				expected: [],
			},
		'the text holds the plural of an acronym ending in IED, the query the acronym → found, the plural rule of ied does not apply':
			{
				lines: ['The ZQIEDs unit opens slowly.'],
				query: 'ZQIED',
				expected: FOUND,
			},
		'the text holds an acronym ending in IED, the query its plural → found, the plural rule of ied does not apply':
			{
				lines: ['The ZQIED unit opens slowly.'],
				query: 'ZQIEDs',
				expected: FOUND,
			},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			expect(hitsOf(testCase)).toEqual(testCase.expected)
		})
	}

	it('the query is a two letter acronym the text holds → the acronym is the term, as typed', () => {
		expect(
			findSynthetic({
				standards: singleFile(blocksOf(['The QZ unit opens slowly.'])),
				query: 'QZ',
			}).map((slice) => slice.terms),
		).toEqual([['QZ']])
	})
})

describe('find: stemming of endings', () => {
	const testCases = Object.fromEntries([
		metPair({ text: 'copied', query: 'copy' }),
		metPair({ text: 'copying', query: 'copies' }),
		metPair({ text: 'copies', query: 'copied' }),
		metPair({ text: 'copy', query: 'copying' }),
		metPair({ text: 'created', query: 'create' }),
		metPair({ text: 'creating', query: 'created' }),
		metPair({ text: 'create', query: 'creating' }),
		metPair({ text: 'mapped', query: 'map' }),
		metPair({ text: 'mapping', query: 'mapped' }),
		metPair({ text: 'map', query: 'mapping' }),
		metPair({ text: 'studying', query: 'studied' }),
		metPair({ text: 'studies', query: 'studying' }),
		metPair({ text: 'zorbitted', query: 'zorbit' }),
		metPair({ text: 'zorbiting', query: 'zorbitted' }),
		metPair({ text: 'called', query: 'call' }),
		metPair({ text: 'passed', query: 'pass' }),
		metPair({ text: 'buzzed', query: 'buzz' }),
		metPair({ text: 'ruled', query: 'rule' }),
		apartPair({ text: 'called', query: 'cal' }),
		apartPair({ text: 'passed', query: 'pas' }),
		apartPair({ text: 'buzzed', query: 'buz' }),
		apartPair({ text: 'string', query: 'str' }),
		apartPair({ text: 'used', query: 'use' }),
		metPair({ text: 'strings', query: 'string' }),
	])

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			expect(hitsOf(testCase)).toEqual(testCase.expected)
		})
	}
})

describe('find: modal and question words', () => {
	const MODAL_WORDS = [
		'may',
		'shall',
		'should',
		'must',
		'will',
		'would',
		'can',
		'could',
		'might',
		'what',
		'which',
		'when',
		'where',
		'who',
		'whom',
		'whose',
		'why',
		'how',
		'does',
		'did',
		'do',
	]
	const NEW_MODAL_WORDS = ['may', 'shall', 'should', 'must']

	for (const word of NEW_MODAL_WORDS)
		it(`the query is "${word}", the text holds it → nothing`, () => {
			expect(
				hitsOf({ lines: [`The valve ${word} open slowly.`], query: word, expected: [] }),
			).toEqual([])
		})

	it('the query is every modal and question word, the text holds them all → nothing', () => {
		expect(
			hitsOf({
				lines: [`The valve ${MODAL_WORDS.join(' ')} open.`],
				query: MODAL_WORDS.join(' '),
				expected: [],
			}),
		).toEqual([])
	})

	it('a word and modal words in the query, a second line holding a modal word → the slice and terms of the word alone', () => {
		expect(
			findSynthetic({
				standards: singleFile([
					{ kind: 'heading', number: '1', title: 'Alpha' },
					{ kind: 'raw', lines: ['The valve opens.', '', 'It may close and shall stop.'] },
				]),
				query: 'valve may shall should must',
			}).map((slice) => ({ from: slice.from, to: slice.to, terms: slice.terms })),
		).toEqual([{ from: 2, to: 2, terms: ['valve'] }])
	})
})
