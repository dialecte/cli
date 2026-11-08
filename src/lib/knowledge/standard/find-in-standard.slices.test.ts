import {
	codeLines,
	findSynthetic,
	padded,
	singleFile,
} from '../../../../test/search-synthetic-standard.ts'
import { captionLine, citationOf } from '../../../../test/synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardSlice } from './standard-search.types.ts'

type TestCase = {
	blocks: SyntheticBlock[]
	query: string
	limit?: number
	/** The fields of the slices that the case pins; the others are not compared. */
	pinned: (keyof StandardSlice)[]
	expected: Partial<StandardSlice>[]
}

const HIT_CODE_LINE = 'entry zorbit'
const FILLER_CODE_LINE = 'filler'
const SAMPLE_CAPTION = captionLine({ word: 'table', number: '1', title: 'Sample values' })

function heading(number: string, title: string): SyntheticBlock {
	return { kind: 'heading', number, title }
}

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

function blank(): SyntheticBlock {
	return { kind: 'blank' }
}

function clauseReference(number: string): string {
	return citationOf({ word: 'clause', number })
}

/** A code line holding the query word, `fillerCount` code lines without it, and a last code line holding it. */
function codeLinesBetweenHits(fillerCount: number): SyntheticBlock[] {
	return codeLines([
		HIT_CODE_LINE,
		...Array.from({ length: fillerCount }, () => FILLER_CODE_LINE),
		HIT_CODE_LINE,
	])
}

/** A clause heading and its one text line: the target of a reference. */
function targetClause(params: { number: string; title: string }): SyntheticBlock[] {
	return [heading(params.number, params.title), raw(`${params.title} text.`)]
}

function linkedSlice(params: {
	from: number
	to: number
	clause: string
	title: string
}): Partial<StandardSlice> {
	return { ...params, score: 0, terms: [], linked: true }
}

const FULL_FIELDS: (keyof StandardSlice)[] = [
	'from',
	'to',
	'clause',
	'title',
	'score',
	'terms',
	'linked',
]

describe('find: the slice of a unit', () => {
	const testCases: Record<string, TestCase> = {
		'two hits in one clause with lines between → from the first hit to the last, not the heading nor the tail':
			{
				blocks: [
					heading('1', 'Alpha'),
					raw('Zorbit one.'),
					blank(),
					raw('Between.'),
					blank(),
					raw('More zorbit.'),
					blank(),
					raw('Tail text.'),
				],
				query: 'zorbit',
				pinned: ['from', 'to'],
				expected: [{ from: 2, to: 6 }],
			},
		'two query words in two lines of a clause → from the first hit to the last': {
			blocks: [
				heading('1', 'Alpha'),
				raw('Zorbit one.'),
				blank(),
				raw('Between.'),
				blank(),
				raw('Yak here.'),
			],
			query: 'zorbit yak',
			pinned: ['from', 'to'],
			expected: [{ from: 2, to: 6 }],
		},
		'a hit in the middle line of a three line paragraph → the whole logical line': {
			blocks: [heading('1', 'Alpha'), raw('Plain start.', 'Zorbit middle.', 'Plain end.')],
			query: 'zorbit',
			pinned: ['from', 'to'],
			expected: [{ from: 2, to: 4 }],
		},
		'a hit in a heading title only → from the heading line through the body of the clause': {
			blocks: [heading('1', 'Zorbit topic'), raw('Plain text.')],
			query: 'zorbit',
			pinned: ['from', 'to', 'clause', 'title'],
			expected: [{ from: 1, to: 2, clause: '1', title: 'Zorbit topic' }],
		},
		'a hit in a heading title only, a clause of 70 lines → from the heading line, 60 lines counted':
			{
				blocks: [
					heading('1', 'Zorbit topic'),
					...codeLines(Array.from({ length: 70 }, () => FILLER_CODE_LINE)),
				],
				query: 'zorbit',
				pinned: ['from', 'to'],
				expected: [{ from: 1, to: 60 }],
			},
		'a hit in a heading title only, a child clause after the intro → the intro of the clause only':
			{
				blocks: [
					heading('1', 'Zorbit topic'),
					raw('Intro text.'),
					heading('1.1', 'Beta'),
					raw('Beta text.'),
				],
				query: 'zorbit',
				pinned: ['from', 'to', 'clause'],
				expected: [{ from: 1, to: 2, clause: '1' }],
			},
		'a hit in a table caption only → from the caption line through the rows of the table': {
			blocks: [
				heading('1', 'Alpha'),
				{ kind: 'caption', word: 'table', number: '1', title: 'Zorbit values' },
				{
					kind: 'table',
					columns: ['Name', 'Value'],
					rows: [
						['a', '1'],
						['b', '2'],
					],
				},
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'clause'],
			expected: [{ from: 2, to: 6, clause: '1' }],
		},
		'a hit in the body of a clause whose title does not hold it → the title line is not added': {
			blocks: [heading('1', 'Alpha'), raw('Plain start.'), blank(), raw('Zorbit later.')],
			query: 'zorbit',
			pinned: ['from', 'to'],
			expected: [{ from: 4, to: 4 }],
		},
		'a file with no heading → the lines are front matter, the clause is null': {
			blocks: [raw('Zorbit text.')],
			query: 'zorbit',
			pinned: ['from', 'to', 'clause'],
			expected: [{ from: 1, to: 1, clause: null }],
		},
		'a term in the intro lines of a clause with child clauses → the clause and its title': {
			blocks: [
				heading('1', 'Alpha'),
				raw('Zorbit intro.'),
				heading('1.1', 'Beta'),
				raw('Beta text.'),
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'clause', 'title'],
			expected: [{ from: 2, to: 2, clause: '1', title: 'Alpha' }],
		},
		'a term only in a child clause of a clause with intro lines → the child unit, not the parent': {
			blocks: [
				heading('1', 'Alpha'),
				raw('Intro text.'),
				heading('1.1', 'Beta'),
				raw('Zorbit child.'),
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'clause', 'title'],
			expected: [{ from: 4, to: 4, clause: '1.1', title: 'Beta' }],
		},
		'a hit in front matter → the title is null': {
			blocks: [raw('Zorbit text.')],
			query: 'zorbit',
			pinned: ['from', 'to', 'title'],
			expected: [{ from: 1, to: 1, title: null }],
		},
		'a hit in a table without a caption → the title is null': {
			blocks: [
				heading('1', 'Alpha'),
				{ kind: 'table', columns: ['Name', 'Value'], rows: [['Zorbit', '2']] },
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'title'],
			expected: [{ from: 2, to: 4, title: null }],
		},
		'a hit in the second row of a table with a caption → from the caption to that row': {
			blocks: [
				heading('1', 'Alpha'),
				{ kind: 'caption', word: 'table', number: '1', title: 'Sample values' },
				{
					kind: 'table',
					columns: ['Name', 'Value'],
					rows: [
						['x', '1'],
						['Zorbit', '2'],
						['y', '3'],
					],
				},
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'clause', 'title'],
			expected: [{ from: 2, to: 6, clause: '1', title: SAMPLE_CAPTION }],
		},
		'a hit in the header row of a table with a caption → from the caption to the header row': {
			blocks: [
				heading('1', 'Alpha'),
				{ kind: 'caption', word: 'table', number: '1', title: 'Sample values' },
				{ kind: 'table', columns: ['Name', 'Zorbit'], rows: [['x', '1']] },
			],
			query: 'zorbit',
			pinned: ['from', 'to'],
			expected: [{ from: 2, to: 3 }],
		},
		'a hit in a table without a caption → from its first row to the hit row': {
			blocks: [
				heading('1', 'Alpha'),
				{
					kind: 'table',
					columns: ['Name', 'Value'],
					rows: [
						['x', '1'],
						['Zorbit', '2'],
					],
				},
			],
			query: 'zorbit',
			pinned: ['from', 'to'],
			expected: [{ from: 2, to: 5 }],
		},
		'hits 60 lines apart, one logical line each → the whole range': {
			blocks: [heading('1', 'Alpha'), ...codeLinesBetweenHits(58)],
			query: 'zorbit',
			pinned: ['from', 'to'],
			expected: [{ from: 2, to: 61 }],
		},
		'hits 61 lines apart → the window of 60 lines from the first hit': {
			blocks: [heading('1', 'Alpha'), ...codeLinesBetweenHits(59)],
			query: 'zorbit',
			pinned: ['from', 'to'],
			expected: [{ from: 2, to: 61 }],
		},
		'hits far apart, the first after ten lines of the clause → the window starts at the first hit':
			{
				blocks: [
					heading('1', 'Alpha'),
					...codeLines(Array.from({ length: 10 }, () => FILLER_CODE_LINE)),
					...codeLinesBetweenHits(77),
				],
				query: 'zorbit',
				pinned: ['from', 'to'],
				expected: [{ from: 12, to: 71 }],
			},
		'the first hit in a logical line of 65 lines, a second hit after it → that line alone': {
			blocks: [
				heading('1', 'Alpha'),
				raw('Zorbit begins.', ...Array.from({ length: 64 }, () => 'Plain words.')),
				...codeLines([HIT_CODE_LINE]),
			],
			query: 'zorbit',
			pinned: ['from', 'to'],
			expected: [{ from: 2, to: 66 }],
		},
		'a range of 85 lines holding 25 noise lines → 60 lines counted, the whole range': {
			blocks: [
				heading('1', 'Alpha'),
				...codeLines([HIT_CODE_LINE]),
				{ kind: 'oneCharacterRun', count: 25 },
				...codeLinesBetweenHits(58).slice(1),
			],
			query: 'zorbit',
			pinned: ['from', 'to'],
			expected: [{ from: 2, to: 86 }],
		},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			expect(
				findSynthetic({
					standards: singleFile(testCase.blocks),
					query: testCase.query,
					limit: testCase.limit,
				}).map((slice) =>
					Object.fromEntries(testCase.pinned.map((field) => [field, slice[field]])),
				),
			).toEqual(testCase.expected)
		})
	}
})

describe('find: the linked slices', () => {
	const testCases: Record<string, TestCase> = {
		'a resolved reference inside the slice → the target clause follows, linked, score 0, no terms':
			{
				blocks: [
					heading('1', 'Alpha'),
					raw(`Zorbit text, ${clauseReference('2')}.`),
					...targetClause({ number: '2', title: 'Beta' }),
				],
				query: 'zorbit',
				pinned: FULL_FIELDS,
				expected: [
					{
						from: 2,
						to: 2,
						clause: '1',
						title: 'Alpha',
						score: 0.59,
						terms: ['zorbit'],
						linked: false,
					},
					linkedSlice({ from: 3, to: 4, clause: '2', title: 'Beta' }),
				],
			},
		'a reference to a clause the file does not have → no linked slice': {
			blocks: [
				heading('1', 'Alpha'),
				raw(`Zorbit text, ${clauseReference('9')}.`),
				...targetClause({ number: '2', title: 'Beta' }),
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'linked'],
			expected: [{ from: 2, to: 2, linked: false }],
		},
		'a reference in a line of the clause outside the slice → no linked slice': {
			blocks: [
				heading('1', 'Alpha'),
				raw('Zorbit text.'),
				blank(),
				raw(`Later, ${clauseReference('2')}.`),
				...targetClause({ number: '2', title: 'Beta' }),
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'linked'],
			expected: [{ from: 2, to: 2, linked: false }],
		},
		'a reference in a line between two hits → the target is linked': {
			blocks: [
				heading('1', 'Alpha'),
				raw('Zorbit one.'),
				blank(),
				raw(`Between, ${clauseReference('2')}.`),
				blank(),
				raw('Zorbit two.'),
				...targetClause({ number: '2', title: 'Beta' }),
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'clause', 'linked'],
			expected: [
				{ from: 2, to: 6, clause: '1', linked: false },
				{ from: 7, to: 8, clause: '2', linked: true },
			],
		},
		'the target is itself a direct slice → given once, as direct': {
			blocks: [
				heading('1', 'Alpha'),
				raw(`Zorbit text, ${clauseReference('2')}.`),
				heading('2', 'Beta'),
				raw('Zorbit text.'),
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'linked'],
			expected: [
				{ from: 2, to: 2, linked: false },
				{ from: 4, to: 4, linked: false },
			],
		},
		'two direct slices referring to one clause → it is linked once, after both': {
			blocks: [
				heading('1', 'Alpha'),
				raw(`Zorbit one, ${clauseReference('3')}.`),
				heading('2', 'Beta'),
				raw(`Zorbit two, ${clauseReference('3')}.`),
				...targetClause({ number: '3', title: 'Gamma' }),
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'clause', 'linked'],
			expected: [
				{ from: 2, to: 2, clause: '1', linked: false },
				{ from: 4, to: 4, clause: '2', linked: false },
				{ from: 5, to: 6, clause: '3', linked: true },
			],
		},
		'a slice referring to three clauses, a limit of 2 → two linked slices, in the order of the references':
			{
				blocks: [
					heading('1', 'Alpha'),
					raw(
						`Zorbit text, ${clauseReference('2')}, ${clauseReference('3')}, ${clauseReference('4')}.`,
					),
					...targetClause({ number: '2', title: 'Beta' }),
					...targetClause({ number: '3', title: 'Gamma' }),
					...targetClause({ number: '4', title: 'Delta' }),
				],
				query: 'zorbit',
				limit: 2,
				pinned: ['from', 'to', 'clause', 'linked'],
				expected: [
					{ from: 2, to: 2, clause: '1', linked: false },
					{ from: 3, to: 4, clause: '2', linked: true },
					{ from: 5, to: 6, clause: '3', linked: true },
				],
			},
		'a slice referring to two clauses, a limit of 1 → one linked slice': {
			blocks: [
				heading('1', 'Alpha'),
				raw(`Zorbit text, ${clauseReference('2')}, ${clauseReference('3')}.`),
				...targetClause({ number: '2', title: 'Beta' }),
				...targetClause({ number: '3', title: 'Gamma' }),
			],
			query: 'zorbit',
			limit: 1,
			pinned: ['from', 'to', 'clause', 'linked'],
			expected: [
				{ from: 2, to: 2, clause: '1', linked: false },
				{ from: 3, to: 4, clause: '2', linked: true },
			],
		},
		'a reference to a table → the table from its caption to its last row, the caption as title': {
			blocks: [
				heading('1', 'Alpha'),
				raw(`Zorbit text, ${citationOf({ word: 'table', number: '1' })}.`),
				heading('2', 'Beta'),
				{ kind: 'caption', word: 'table', number: '1', title: 'Sample values' },
				{
					kind: 'table',
					columns: ['Name', 'Value'],
					rows: [
						['a', '1'],
						['b', '2'],
					],
				},
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'clause', 'title', 'score', 'terms', 'linked'],
			expected: [
				{
					from: 2,
					to: 2,
					clause: '1',
					title: 'Alpha',
					score: 0.59,
					terms: ['zorbit'],
					linked: false,
				},
				{ from: 4, to: 8, clause: '2', title: SAMPLE_CAPTION, score: 0, terms: [], linked: true },
			],
		},
		'a reference to a clause of 71 lines → the linked slice stops at 60 lines from its heading': {
			blocks: [
				heading('1', 'Alpha'),
				raw(`Zorbit text, ${clauseReference('2')}.`),
				heading('2', 'Beta'),
				...codeLines(Array.from({ length: 70 }, () => FILLER_CODE_LINE)),
			],
			query: 'zorbit',
			pinned: ['from', 'to', 'clause', 'linked'],
			expected: [
				{ from: 2, to: 2, clause: '1', linked: false },
				{ from: 3, to: 62, clause: '2', linked: true },
			],
		},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			expect(
				findSynthetic({
					standards: padded(testCase.blocks),
					query: testCase.query,
					limit: testCase.limit,
				}).map((slice) =>
					Object.fromEntries(testCase.pinned.map((field) => [field, slice[field]])),
				),
			).toEqual(testCase.expected)
		})
	}
})
