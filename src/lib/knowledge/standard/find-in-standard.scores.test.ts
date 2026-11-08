import { SYNTHETIC_VOCABULARY } from '../../../../test/search-synthetic-standard.constants.ts'
import {
	findSynthetic,
	padded,
	paddingFileOf,
	separatedLines,
	singleFile,
} from '../../../../test/search-synthetic-standard.ts'
import { citationOf } from '../../../../test/synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type {
	StandardSlice,
	StandardVocabulary,
} from '../../../../src/lib/knowledge/standard/standard-search.types.ts'
import type { SyntheticFile } from '../../../../test/search-synthetic-standard.types.ts'
import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'

type TestCase = {
	standards: SyntheticFile[][]
	vocabulary?: StandardVocabulary
	query: string
	about?: string
	limit?: number
	/** The fields of the slices that the case pins; the others are not compared. */
	pinned: (keyof StandardSlice)[]
	expected: Partial<StandardSlice>[]
}

const FIRST_FILE = 'synthetic/aa-9000-3'
const MIDDLE_FILE = 'synthetic/mm-9000-3'
const LAST_FILE = 'synthetic/zz-9000-3'

const LONG_ATTRIBUTE_VOCABULARY: StandardVocabulary = { tags: [], attributes: ['abc'], values: [] }

const CAPITAL_ATTRIBUTE_VOCABULARY: StandardVocabulary = {
	tags: [],
	attributes: ['Abc'],
	values: [],
}

function heading(number: string, title: string): SyntheticBlock {
	return { kind: 'heading', number, title }
}

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

function clauseReference(number: string): string {
	return citationOf({ word: 'clause', number })
}

/** A clause heading and its one text line: the target of a reference. */
function targetClause(params: { number: string; title: string }): SyntheticBlock[] {
	return [heading(params.number, params.title), raw(`${params.title} text.`)]
}

/**
 * One clause of `total` logical lines: `hits` lines holding the word, the others unrelated; the heading
 * counts as one of them. The word is held by `hits` of `total` lines.
 */
function clauseOfLines(params: { total: number; hits: number }): SyntheticBlock[] {
	const others = params.total - 1 - params.hits
	return [
		heading('1', 'Alpha'),
		...separatedLines(Array.from({ length: params.hits }, () => 'Zorbit passage.')),
		...separatedLines(Array.from({ length: others }, () => 'Filler passage.')),
	]
}

/** `clauseOfLines` with the tag `D` named by the hit lines instead of a word. */
function clauseOfNameLines(params: { total: number; hits: number }): SyntheticBlock[] {
	const others = params.total - 1 - params.hits
	return [
		heading('1', 'Alpha'),
		...separatedLines(Array.from({ length: params.hits }, () => 'Element D appears.')),
		...separatedLines(Array.from({ length: others }, () => 'Filler passage.')),
	]
}

/** A standard of one file with `hits` lines holding the word, and enough other lines to stay under 5 %. */
function hitsFile(params: { fileId: string; hits: number }): SyntheticFile {
	return {
		fileId: params.fileId,
		blocks: [
			heading('1', 'Alpha'),
			...separatedLines(Array.from({ length: params.hits }, () => 'Zorbit passage.')),
			heading('2', 'Padding'),
			...separatedLines(Array.from({ length: 2100 }, () => 'Filler passage.')),
		],
	}
}

/** Five units naming the tag `D`: text, definition term, table cell, table caption and heading. */
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

/** A tag named in seven lines of one clause, and in the heading of the clause after it. */
const STRONGEST_ONLY_BLOCKS: SyntheticBlock[] = [
	heading('1', 'Plain one'),
	...separatedLines(Array.from({ length: 7 }, () => 'Element D appears.')),
	heading('2', 'Overview of D'),
]

describe('find: exact scores of tag links, about, 5 %, ties, linked order and limit', () => {
	const testCases: Record<string, TestCase> = {
		'one ranking across two standards, the second holding the best slice, a tie broken by the earlier file id of the second, a limit of 3 cutting the list':
			{
				standards: [
					[
						{
							fileId: MIDDLE_FILE,
							blocks: [
								heading('1', 'Alpha'),
								raw('Zorbit text.'),
								heading('2', 'Beta'),
								raw('Zorbit text.'),
							],
						},
						paddingFileOf({ fileId: 'synthetic/pad-9000-1' }),
					],
					[
						{ fileId: FIRST_FILE, blocks: [heading('1', 'Alpha'), raw('Zorbit text.')] },
						{ fileId: LAST_FILE, blocks: [heading('1', 'Zorbit topic'), raw('Plain text.')] },
						paddingFileOf({ fileId: 'synthetic/pad-9000-2' }),
					],
				],
				query: 'zorbit',
				limit: 3,
				pinned: ['file', 'from', 'score'],
				expected: [
					{ file: LAST_FILE, from: 1, score: 0.95 },
					{ file: FIRST_FILE, from: 2, score: 0.48 },
					{ file: MIDDLE_FILE, from: 2, score: 0.48 },
				],
			},
		'a tag linked on five lines of five units → no strength, each unit 1 over the tenfold weight 1 + ln 6, heading and caption doubled, ties in file order':
			{
				standards: singleFile(STRENGTH_BLOCKS),
				vocabulary: SYNTHETIC_VOCABULARY,
				query: 'D',
				pinned: ['clause', 'score'],
				expected: [
					{ clause: '4', score: 0.07 },
					{ clause: '5', score: 0.07 },
					{ clause: '1', score: 0.04 },
					{ clause: '2', score: 0.04 },
					{ clause: '3', score: 0.04 },
				],
			},
		'a tag in seven text lines of a clause and in a heading → the weight counts lines, the heading unit doubled':
			{
				standards: singleFile(STRONGEST_ONLY_BLOCKS),
				vocabulary: SYNTHETIC_VOCABULARY,
				query: 'D',
				pinned: ['clause', 'score'],
				expected: [
					{ clause: '2', score: 0.06 },
					{ clause: '1', score: 0.03 },
				],
			},
		'a tag in a table cell and the same tag in the prose of another unit → the same score, a link has no strength':
			{
				standards: padded([
					heading('1', 'Alpha'),
					{ kind: 'table', columns: ['Name', 'Value'], rows: [['D', '1']] },
					heading('2', 'Beta'),
					raw('Element D appears.'),
				]),
				vocabulary: SYNTHETIC_VOCABULARY,
				query: 'D',
				pinned: ['clause', 'score'],
				expected: [
					{ clause: '1', score: 0.48 },
					{ clause: '2', score: 0.48 },
				],
			},
		'a tag in a heading title → counted double, 2 over 1 + ln 2': {
			standards: padded([heading('1', 'Overview of D'), raw('Plain text.')]),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			pinned: ['clause', 'score'],
			expected: [{ clause: '1', score: 1.18 }],
		},
		'a tag linked on 10 of 200 logical lines → exactly 5 %, no tenfold': {
			standards: singleFile(clauseOfNameLines({ total: 200, hits: 10 })),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			pinned: ['score'],
			expected: [{ score: 0.29 }],
		},
		'a tag linked on 11 of 200 logical lines → more than 5 %, tenfold': {
			standards: singleFile(clauseOfNameLines({ total: 200, hits: 11 })),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			pinned: ['score'],
			expected: [{ score: 0.03 }],
		},
		'a tag in plain text of a standard of two lines, nothing padded → tenfold like a word': {
			standards: singleFile([heading('1', 'Alpha'), raw('Element D is used.')]),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'D',
			pinned: ['clause', 'score'],
			expected: [{ clause: '1', score: 0.06 }],
		},
		'a longer name with the vocabulary → matched as a name, scored like a word': {
			standards: singleFile([heading('1', 'Alpha'), raw('Element DD_1 is used.')]),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'DD_1',
			pinned: ['clause', 'score', 'terms'],
			expected: [{ clause: '1', score: 0.06, terms: ['DD_1'] }],
		},
		'no query and --about a tag → the tag counts twice': {
			standards: singleFile([heading('1', 'Alpha'), raw('Plain text with D inside.')]),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: '',
			about: 'D',
			pinned: ['clause', 'score', 'terms'],
			expected: [{ clause: '1', score: 0.12, terms: ['D'] }],
		},
		'a lowercase attribute of three characters in plain text → scored as a word, the common word weight':
			{
				standards: singleFile([heading('1', 'Alpha'), raw('The abc value is used.')]),
				vocabulary: LONG_ATTRIBUTE_VOCABULARY,
				query: 'abc',
				pinned: ['clause', 'score'],
				expected: [{ clause: '1', score: 0.06 }],
			},
		'a lowercase attribute of three characters in a heading → scored as a word, title hit doubled':
			{
				standards: singleFile([heading('1', 'Overview of abc'), raw('Plain text.')]),
				vocabulary: LONG_ATTRIBUTE_VOCABULARY,
				query: 'abc',
				pinned: ['clause', 'score'],
				expected: [{ clause: '1', score: 0.12 }],
			},
		'a lowercase attribute of three characters with an at sign → scored as a word': {
			standards: singleFile([heading('1', 'Alpha'), raw('Set @abc on the item.')]),
			vocabulary: LONG_ATTRIBUTE_VOCABULARY,
			query: 'abc',
			pinned: ['clause', 'score'],
			expected: [{ clause: '1', score: 0.06 }],
		},
		'a capitalised attribute of three characters in plain text → matched as a name, the common word weight':
			{
				standards: singleFile([heading('1', 'Alpha'), raw('The Abc value is used.')]),
				vocabulary: CAPITAL_ATTRIBUTE_VOCABULARY,
				query: 'Abc',
				pinned: ['clause', 'score'],
				expected: [{ clause: '1', score: 0.06 }],
			},
		'a capitalised attribute of three characters in a heading → matched as a name, title hit doubled':
			{
				standards: singleFile([heading('1', 'Overview of Abc'), raw('Plain text.')]),
				vocabulary: CAPITAL_ATTRIBUTE_VOCABULARY,
				query: 'Abc',
				pinned: ['clause', 'score'],
				expected: [{ clause: '1', score: 0.12 }],
			},
		'an attribute of one character in a heading title → not linked': {
			standards: singleFile([heading('1', 'Overview of a'), raw('Plain text.')]),
			vocabulary: SYNTHETIC_VOCABULARY,
			query: 'a',
			pinned: ['clause'],
			expected: [],
		},
		'a word in exactly 5 % of the logical lines → no tenfold': {
			standards: singleFile(clauseOfLines({ total: 200, hits: 10 })),
			query: 'zorbit',
			pinned: ['score'],
			expected: [{ score: 0.29 }],
		},
		'a word in 11 of 200 logical lines → tenfold': {
			standards: singleFile(clauseOfLines({ total: 200, hits: 11 })),
			query: 'zorbit',
			pinned: ['score'],
			expected: [{ score: 0.03 }],
		},
		'a word in the heading and the text of one unit → it counts double, not triple': {
			standards: padded([heading('1', 'Zorbit topic'), raw('Zorbit text.')]),
			query: 'zorbit',
			pinned: ['score'],
			expected: [{ score: 0.95 }],
		},
		'a query word typed in capitals and as a plural → terms show it as typed': {
			standards: padded([heading('1', 'Alpha'), raw('The valves open.')]),
			query: 'Valves',
			pinned: ['terms'],
			expected: [{ terms: ['Valves'] }],
		},
		'a query word repeated → one term, counted once': {
			standards: padded([heading('1', 'Alpha'), raw('Zorbit text.')]),
			query: 'zorbit zorbit',
			pinned: ['terms', 'score'],
			expected: [{ terms: ['zorbit'], score: 0.59 }],
		},
		'two scores equal once rounded, the lower one in the earlier file → ordered by file id, not by raw score':
			{
				standards: [
					[hitsFile({ fileId: LAST_FILE, hits: 100 })],
					[hitsFile({ fileId: FIRST_FILE, hits: 101 })],
				],
				query: 'zorbit',
				pinned: ['file', 'score'],
				expected: [
					{ file: FIRST_FILE, score: 0.18 },
					{ file: LAST_FILE, score: 0.18 },
				],
			},
		'references written in reverse order, a limit of 2 → linked in the order of the references': {
			standards: singleFile([
				heading('1', 'Alpha'),
				raw(
					`Zorbit text, ${clauseReference('4')}, ${clauseReference('3')}, ${clauseReference('2')}.`,
				),
				...targetClause({ number: '2', title: 'Beta' }),
				...targetClause({ number: '3', title: 'Gamma' }),
				...targetClause({ number: '4', title: 'Delta' }),
			]),
			query: 'zorbit',
			limit: 2,
			pinned: ['from', 'to', 'clause', 'linked'],
			expected: [
				{ from: 2, to: 2, clause: '1', linked: false },
				{ from: 7, to: 8, clause: '4', linked: true },
				{ from: 5, to: 6, clause: '3', linked: true },
			],
		},
		'the best direct slice later in the file than the second, each referring to its own clause → linked in rank order':
			{
				standards: singleFile([
					heading('1', 'Alpha'),
					raw(`Zorbit alone, ${clauseReference('3')}.`),
					heading('2', 'Beta'),
					raw(`Zorbit and yak, ${clauseReference('4')}.`),
					...targetClause({ number: '3', title: 'Gamma' }),
					...targetClause({ number: '4', title: 'Delta' }),
				]),
				query: 'yak zorbit',
				pinned: ['from', 'to', 'clause', 'linked'],
				expected: [
					{ from: 4, to: 4, clause: '2', linked: false },
					{ from: 2, to: 2, clause: '1', linked: false },
					{ from: 7, to: 8, clause: '4', linked: true },
					{ from: 5, to: 6, clause: '3', linked: true },
				],
			},
		'a direct slice cut by the limit, the only reference inside it → no linked slice': {
			standards: singleFile([
				heading('1', 'Alpha'),
				raw('Zorbit text.'),
				heading('2', 'Beta'),
				raw(`Zorbit text, ${clauseReference('3')}.`),
				...targetClause({ number: '3', title: 'Gamma' }),
			]),
			query: 'zorbit',
			limit: 1,
			pinned: ['from', 'to', 'clause', 'linked'],
			expected: [{ from: 2, to: 2, clause: '1', linked: false }],
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
})
