import {
	PADDING_FILE,
	SYNTHETIC_VOCABULARY,
} from '../../../../test/search-synthetic-standard.constants.ts'
import {
	findSynthetic,
	padded,
	paddingFileOf,
	separatedLines,
	singleFile,
} from '../../../../test/search-synthetic-standard.ts'
import { captionLine } from '../../../../test/synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { StandardVocabulary } from '../../../../src/lib/knowledge/standard/standard-search.types.ts'
import type { SyntheticFile } from '../../../../test/search-synthetic-standard.types.ts'
import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'

type Projection = {
	file: string
	from: number
	to: number
	clause: string | null
	score: number
	terms: string[]
	linked: boolean
}

type TestCase = {
	standards: SyntheticFile[][]
	vocabulary?: StandardVocabulary
	query: string
	about?: string
	limit?: number
	expected: Partial<Projection>[]
	/** The fields of the slices that the case pins; the others are not compared. */
	pinned: (keyof Projection)[]
}

const FILE = 'synthetic/zz-9000-3'
const FIRST_FILE = 'synthetic/aa-9000-3'
const LAST_FILE = 'synthetic/zz-9000-4'

function heading(number: string, title: string): SyntheticBlock {
	return { kind: 'heading', number, title }
}

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

function blank(): SyntheticBlock {
	return { kind: 'blank' }
}

function sampleTable(...cells: string[]): SyntheticBlock {
	return { kind: 'table', columns: ['Name', 'Value'], rows: [[cells[0] ?? 'x', cells[1] ?? '1']] }
}

/** `count` clauses numbered from 1, each with the one text line `text`. */
function clausesOf(params: { count: number; text: string }): SyntheticBlock[] {
	return Array.from({ length: params.count }, (_unused, index): SyntheticBlock[] => [
		heading(String(index + 1), 'Alpha'),
		raw(params.text),
	]).flat()
}

/** The first `count` clause slices of the file, each its text line (the heading is the line before). */
function clauseSlices(count: number): Partial<Projection>[] {
	return Array.from({ length: count }, (_unused, index) => ({
		from: 2 * index + 2,
		to: 2 * index + 2,
	}))
}

const COMMON_WORD_LINES = 11
const RARE_WORD_LINES = 10
const FREQUENCY_PADDING_LINES = 200

/** A word in 12 of 225 logical lines (above 5 %) in a heading, as many lines of it in one clause, a rarer word in another. */
const FREQUENCY_BLOCKS: SyntheticBlock[] = [
	heading('1', 'Zorbit overview'),
	heading('2', 'Bulk'),
	...separatedLines(Array.from({ length: COMMON_WORD_LINES }, () => 'Zorbit passage.')),
	heading('3', 'Rare'),
	...separatedLines(Array.from({ length: RARE_WORD_LINES }, () => 'Quillon passage.')),
	heading('4', 'Padding'),
	...separatedLines(Array.from({ length: FREQUENCY_PADDING_LINES }, () => 'Filler passage.')),
]

const UNPADDED_FREQUENCY = singleFile(FREQUENCY_BLOCKS)

const TABLE_CAPTION = captionLine({ word: 'table', number: '1', title: 'Zorbit values' })

describe('find: ranking, scores, terms and limit', () => {
	const testCases: Record<string, TestCase> = {
		'a word in over 5 % of the lines in a heading, a rarer word in a clause → the rarer word ranks first':
			{
				standards: UNPADDED_FREQUENCY,
				query: 'zorbit quillon',
				pinned: ['clause'],
				expected: [{ clause: '3' }, { clause: '1' }, { clause: '2' }],
			},
		'a word in over 5 % of the lines alone → still found, the heading hit first': {
			standards: UNPADDED_FREQUENCY,
			query: 'zorbit',
			pinned: ['clause'],
			expected: [{ clause: '1' }, { clause: '2' }],
		},
		'a word in a clause text and in a heading → the heading hit scores double and ranks first': {
			standards: padded([
				heading('1', 'Alpha'),
				raw('Zorbit text.'),
				heading('2', 'Zorbit topic'),
				raw('Plain text.'),
			]),
			query: 'zorbit',
			pinned: ['clause', 'from', 'to', 'score'],
			expected: [
				{ clause: '2', from: 3, to: 4, score: 0.95 },
				{ clause: '1', from: 2, to: 2, score: 0.48 },
			],
		},
		'a word in a clause text and in a table caption → the caption hit scores double and ranks first':
			{
				standards: padded([
					heading('1', 'Alpha'),
					raw('Zorbit text.'),
					blank(),
					{ kind: 'caption', word: 'table', number: '1', title: 'Zorbit values' },
					sampleTable(),
				]),
				query: 'zorbit',
				pinned: ['clause', 'from', 'to', 'score'],
				expected: [
					{ clause: '1', from: 4, to: 7, score: 0.95 },
					{ clause: '1', from: 2, to: 2, score: 0.48 },
				],
			},
		'a word in three lines of one clause → one hit for the unit, the frequency counts the lines': {
			standards: padded([
				heading('1', 'Alpha'),
				...separatedLines(['Zorbit one.', 'Zorbit two.', 'Zorbit three.']),
			]),
			query: 'zorbit',
			pinned: ['from', 'to', 'score'],
			expected: [{ from: 2, to: 6, score: 0.42 }],
		},
		'a word in a front matter line, a clause line and a table row → three units in file order, equal scores':
			{
				standards: padded([
					raw('Zorbit front matter.'),
					blank(),
					heading('1', 'Alpha'),
					raw('Zorbit text.'),
					blank(),
					{ kind: 'caption', word: 'table', number: '1', title: 'Sample values' },
					{
						kind: 'table',
						columns: ['Name', 'Zorbit'],
						rows: [['a', '1']],
					},
				]),
				query: 'zorbit',
				pinned: ['file', 'from', 'to', 'clause', 'score', 'terms', 'linked'],
				expected: [
					{
						file: FILE,
						from: 1,
						to: 1,
						clause: null,
						score: 0.42,
						terms: ['zorbit'],
						linked: false,
					},
					{
						file: FILE,
						from: 4,
						to: 4,
						clause: '1',
						score: 0.42,
						terms: ['zorbit'],
						linked: false,
					},
					{
						file: FILE,
						from: 6,
						to: 7,
						clause: '1',
						score: 0.42,
						terms: ['zorbit'],
						linked: false,
					},
				],
			},
		'two files holding the same hit → equal scores, ordered by file id whatever the order given': {
			standards: [
				[
					{ fileId: LAST_FILE, blocks: [heading('1', 'Alpha'), raw('Zorbit text.')] },
					{ fileId: FIRST_FILE, blocks: [heading('1', 'Alpha'), raw('Zorbit text.')] },
					PADDING_FILE,
				],
			],
			query: 'zorbit',
			pinned: ['file', 'from', 'to', 'score'],
			expected: [
				{ file: FIRST_FILE, from: 2, to: 2, score: 0.48 },
				{ file: LAST_FILE, from: 2, to: 2, score: 0.48 },
			],
		},
		'two clauses holding the same hit → equal scores, ordered by line': {
			standards: padded(clausesOf({ count: 2, text: 'Zorbit text.' })),
			query: 'zorbit',
			pinned: ['from', 'to'],
			expected: clauseSlices(2),
		},
		'two standards, the word in one line of the file named last, in three of the other → each standard counts its own lines':
			{
				standards: [
					[
						{ fileId: LAST_FILE, blocks: [heading('1', 'Alpha'), raw('Zorbit text.')] },
						paddingFileOf({ fileId: 'synthetic/pad-9000-1' }),
					],
					[
						{
							fileId: FIRST_FILE,
							blocks: [heading('1', 'Alpha'), ...separatedLines(['Zorbit one.', 'Zorbit two.'])],
						},
						{ fileId: 'synthetic/mm-9000-3', blocks: [heading('1', 'Alpha'), raw('Zorbit text.')] },
						paddingFileOf({ fileId: 'synthetic/pad-9000-2' }),
					],
				],
				query: 'zorbit',
				pinned: ['file', 'score'],
				expected: [
					{ file: LAST_FILE, score: 0.59 },
					{ file: FIRST_FILE, score: 0.42 },
					{ file: 'synthetic/mm-9000-3', score: 0.42 },
				],
			},
		'a tag linked to one unit, in plain text → its score is 1 over 1 + ln 2': {
			standards: padded([heading('1', 'Alpha'), raw('Element D is used.')]),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			pinned: ['from', 'to', 'score'],
			expected: [{ from: 2, to: 2, score: 0.59 }],
		},
		'a clause with both query words and a clause with one → the first ranks first, terms in query order':
			{
				standards: padded([
					heading('1', 'Alpha'),
					raw('Zorbit alone.'),
					heading('2', 'Beta'),
					raw('Zorbit and yak together.'),
				]),
				query: 'yak zorbit',
				pinned: ['clause', 'terms'],
				expected: [
					{ clause: '2', terms: ['yak', 'zorbit'] },
					{ clause: '1', terms: ['zorbit'] },
				],
			},
		'a query with a word no clause holds → the terms are the ones that hit': {
			standards: padded([heading('1', 'Alpha'), raw('Zorbit alone.')]),
			query: 'pump zorbit',
			pinned: ['terms'],
			expected: [{ terms: ['zorbit'] }],
		},
		'twelve clauses hold the word, no limit → the first ten': {
			standards: padded(clausesOf({ count: 12, text: 'Zorbit text.' })),
			query: 'zorbit',
			pinned: ['from', 'to'],
			expected: clauseSlices(10),
		},
		'twelve clauses hold the word, a limit of 2 → the first two': {
			standards: padded(clausesOf({ count: 12, text: 'Zorbit text.' })),
			query: 'zorbit',
			limit: 2,
			pinned: ['from', 'to'],
			expected: clauseSlices(2),
		},
		'a hit in a table caption → the slice runs from the caption line through the table, in the clause of the table':
			{
				standards: padded([
					heading('1', 'Alpha'),
					{ kind: 'caption', word: 'table', number: '1', title: 'Zorbit values' },
					sampleTable(),
				]),
				query: 'zorbit',
				pinned: ['clause', 'from', 'to'],
				expected: [{ clause: '1', from: 2, to: 5 }],
			},
		'no clause holds the word → nothing': {
			standards: padded([heading('1', 'Alpha'), raw('Plain text.')]),
			query: 'zorbit',
			pinned: ['from'],
			expected: [],
		},
		'a word and --about a tag a clause holds → that clause ranks first, the tag is its last term': {
			standards: padded([
				heading('1', 'Alpha'),
				raw('Zorbit text.'),
				heading('2', 'Beta'),
				raw('Zorbit text with D inside.'),
			]),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'zorbit',
			about: 'D',
			pinned: ['clause', 'terms'],
			expected: [
				{ clause: '2', terms: ['zorbit', 'D'] },
				{ clause: '1', terms: ['zorbit'] },
			],
		},
		'no query word and --about a tag → the clauses naming the tag': {
			standards: padded([
				heading('1', 'Alpha'),
				raw('Zorbit text.'),
				heading('2', 'Beta'),
				raw('Plain text with D inside.'),
			]),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: '',
			about: 'D',
			pinned: ['clause', 'terms'],
			expected: [{ clause: '2', terms: ['D'] }],
		},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			expect(
				findSynthetic({
					standards: testCase.standards,
					vocabulary: testCase.vocabulary,
					query: testCase.query,
					about: testCase.about,
					limit: testCase.limit,
				}).map((slice) =>
					Object.fromEntries(testCase.pinned.map((field) => [field, slice[field]])),
				),
			).toEqual(testCase.expected)
		})
	}

	it('a table caption slice names the caption as its title', () => {
		expect(
			findSynthetic({
				standards: padded([
					heading('1', 'Alpha'),
					{ kind: 'caption', word: 'table', number: '1', title: 'Zorbit values' },
					sampleTable(),
				]),
				query: 'zorbit',
			}).map((slice) => slice.title),
		).toEqual([TABLE_CAPTION])
	})

	it('a clause slice names the heading title as its title', () => {
		expect(
			findSynthetic({
				standards: padded([heading('1', 'Alpha'), raw('Zorbit text.')]),
				query: 'zorbit',
			}).map((slice) => slice.title),
		).toEqual(['Alpha'])
	})
})
