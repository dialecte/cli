import { indexSynthetic, syntheticId } from '../../../../test/index-synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardFileIndex, StandardHeading } from './standard-index.types.ts'

type KeptCase = {
	blocks: SyntheticBlock[]
	/** `<id suffix>@<first line>` of each kept heading, in file order. */
	expected: string[]
}

type RangeCase = {
	blocks: SyntheticBlock[]
	expected: StandardHeading[]
}

const TITLES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta']

/** One heading per number, each with its own title, one line each. */
function numbered(...numbers: string[]): SyntheticBlock[] {
	return numbers.map((number, index) => ({
		kind: 'heading' as const,
		number,
		title: TITLES[index],
	}))
}

function heading(number: string, title: string): SyntheticBlock {
	return { kind: 'heading', number, title }
}

function body(): SyntheticBlock {
	return { kind: 'raw', lines: ['Body text.'] }
}

function keptOf(index: StandardFileIndex): string[] {
	return index.headings.map((kept) => `${kept.id.slice(syntheticId('').length)}@${kept.from}`)
}

function headingsOf(index: StandardFileIndex): StandardHeading[] {
	return index.headings
}

describe('headings: which candidates are kept', () => {
	const testCases: Record<string, KeptCase> = {
		'a plain tree → every heading kept': {
			blocks: numbered('1', '1.1', '1.2', '2', '2.1'),
			expected: ['1@1', '1.1@2', '1.2@3', '2@4', '2.1@5'],
		},
		'a file starting at 4 → kept, any start number': {
			blocks: numbered('4', '4.1', '5'),
			expected: ['4@1', '4.1@2', '5@3'],
		},
		'a file starting at a nested number → kept': {
			blocks: numbered('2.3', '2.4', '3'),
			expected: ['2.3@1', '2.4@2', '3@3'],
		},
		'a change-list number above 50 between real headings → prose, the rest kept': {
			blocks: [heading('1', 'Alpha'), heading('1672', 'Change entry'), heading('2', 'Beta')],
			expected: ['1@1', '2@3'],
		},
		'a top-level number of 50 alone → kept': {
			blocks: [heading('50', 'Last one')],
			expected: ['50@1'],
		},
		'a number out of order → prose, the others kept': {
			blocks: numbered('1', '2', '9', '3', '4'),
			expected: ['1@1', '2@2', '3@4', '4@5'],
		},
		'two chains of the same length → the earliest lines win': {
			blocks: numbered('1', '3', '2', '4'),
			expected: ['1@1', '3@2', '4@4'],
		},
		'a duplicate number → the first kept, the copy prose': {
			blocks: [
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
				heading('1.1', 'Beta again'),
				heading('1.2', 'Gamma'),
			],
			expected: ['1@1', '1.1@2', '1.2@4'],
		},
		'a step two levels deeper → prose': {
			blocks: numbered('1', '1.1.1', '1.2'),
			expected: ['1@1', '1.2@3'],
		},
		'a step back up one level at a time or more → kept': {
			blocks: numbered('1', '1.1', '1.1.1', '2'),
			expected: ['1@1', '1.1@2', '1.1.1@3', '2@4'],
		},
		'a step back in tree order → prose': {
			blocks: numbered('2', '1.5', '3'),
			expected: ['2@1', '3@3'],
		},
		'a top-level jump of 3 → kept': {
			blocks: numbered('2', '5'),
			expected: ['2@1', '5@2'],
		},
		'a top-level jump of 4 with a longer tail → the tail alone kept': {
			blocks: numbered('1', '2', '6', '7', '8'),
			expected: ['6@3', '7@4', '8@5'],
		},
		'a top-level jump of 4 with a shorter tail → the head kept, the tail prose': {
			blocks: numbered('1', '2', '3', '7'),
			expected: ['1@1', '2@2', '3@3'],
		},
		'a missing sub-clause → the rest of the file keeps its headings': {
			blocks: numbered('4.1', '4.3', '5'),
			expected: ['4.1@1', '4.3@2', '5@3'],
		},
		'a missing top-level clause within the jump → the rest kept': {
			blocks: numbered('1', '1.1', '3', '3.1'),
			expected: ['1@1', '1.1@2', '3@3', '3.1@4'],
		},
		'a second pass restarting at 1 → both passes kept, ids with a pass suffix': {
			blocks: numbered('1', '1.1', '2', '1', '1.1', '2'),
			expected: ['1@1', '1.1@2', '2@3', '1~2@4', '1.1~2@5', '2~2@6'],
		},
		'a third pass → suffix 3': {
			blocks: numbered('1', '2', '1', '2', '1', '2'),
			expected: ['1@1', '2@2', '1~2@3', '2~2@4', '1~3@5', '2~3@6'],
		},
		'a stray 7 before the real 1, 2, 3 → one pass, the stray prose': {
			blocks: numbered('7', '1', '2', '3'),
			expected: ['1@2', '2@3', '3@4'],
		},
		'1, 2, 3 then 1, 2 → the second 1 restarts a pass': {
			blocks: numbered('1', '2', '3', '1', '2'),
			expected: ['1@1', '2@2', '3@3', '1~2@4', '2~2@5'],
		},
		'a stray 7 before both passes → the stray prose, both passes kept': {
			blocks: numbered('7', '1', '2', '3', '1', '2'),
			expected: ['1@2', '2@3', '3@4', '1~2@5', '2~2@6'],
		},
		'toc lines before the body → never headings, no second pass': {
			blocks: [
				{ kind: 'tocEntry', number: '1', title: 'Alpha', page: '3' },
				{ kind: 'tocEntry', number: '2', title: 'Beta', page: '4' },
				heading('1', 'Alpha'),
				heading('2', 'Beta'),
			],
			expected: ['1@3', '2@4'],
		},
		'a heading-shaped line inside a fence → not a candidate': {
			blocks: [{ kind: 'fence', lines: ['1  Scope'] }, heading('1', 'Real scope')],
			expected: ['1@4'],
		},
		'a markdown ordered list in the body between real headings → no second pass, the headings and their lines unchanged':
			{
				blocks: [
					heading('1', 'Alpha'),
					heading('2', 'Beta'),
					{ kind: 'raw', lines: ['1. First item', '2. Second item', '3. Third item'] },
					heading('3', 'Gamma'),
					heading('4', 'Delta'),
				],
				expected: ['1@1', '2@2', '3@6', '4@7'],
			},
		'a markdown ordered list in a file whose headings carry a marker → the list prose, no second pass':
			{
				blocks: [
					{ kind: 'heading', number: '1', title: 'Alpha', marker: '## ' },
					{ kind: 'heading', number: '2', title: 'Beta', marker: '## ' },
					{ kind: 'raw', lines: ['1. First item', '2. Second item', '3. Third item'] },
					{ kind: 'heading', number: '3', title: 'Gamma', marker: '## ' },
				],
				expected: ['1@1', '2@2', '3@6'],
			},
		'a file writing every top-level clause as a dotted number → kept, with their sub-clauses': {
			blocks: [
				{ kind: 'raw', lines: ['1. Alpha'] },
				heading('1.1', 'Beta'),
				{ kind: 'raw', lines: ['2. Gamma'] },
				heading('2.1', 'Delta'),
				{ kind: 'raw', lines: ['3. Epsilon'] },
			],
			expected: ['1@1', '1.1@2', '2@3', '2.1@4', '3@5'],
		},
		'a file writing its top-level clauses as dotted numbers, the third a terms clause → its sub-numbers are definitions, not headings':
			{
				blocks: [
					{ kind: 'raw', lines: ['1. Alpha'] },
					{ kind: 'raw', lines: ['2. Beta'] },
					{ kind: 'raw', lines: ['3. Terms and definitions'] },
					{ kind: 'definition', number: '3.1', term: 'Alpha node', layout: 'inline' },
					{ kind: 'definition', number: '3.2', term: 'Beta node', layout: 'inline' },
					{ kind: 'raw', lines: ['4. Gamma'] },
				],
				expected: ['1@1', '2@2', '3@3', '4@6'],
			},
		'a file writing its top-level clauses as dotted numbers, twice (two languages) → two passes': {
			blocks: [
				{ kind: 'raw', lines: ['1. Alpha'] },
				{ kind: 'raw', lines: ['2. Beta'] },
				{ kind: 'raw', lines: ['1. Alfa'] },
				{ kind: 'raw', lines: ['2. Bravo'] },
			],
			expected: ['1@1', '2@2', '1~2@3', '2~2@4'],
		},
		'a heading behind a markdown marker → kept': {
			blocks: [
				{ kind: 'heading', number: '1', title: 'Scope', marker: '## ' },
				heading('2', 'Next'),
			],
			expected: ['1@1', '2@2'],
		},
		'definition numbers inside the terms clause → not headings': {
			blocks: [
				heading('3', 'Terms and definitions'),
				{ kind: 'definition', number: '3.1', term: 'Alpha node', layout: 'inline' },
				heading('4', 'Next part'),
			],
			expected: ['3@1', '4@3'],
		},
		'annexes after numbered clauses → kept, sub-numbers too': {
			blocks: [
				...numbered('1', '2'),
				{ kind: 'annexHeading', letter: 'A', title: 'First annex' },
				heading('A.1', 'Sub title'),
				{ kind: 'annexHeading', letter: 'B', title: 'Second annex' },
			],
			expected: ['1@1', '2@2', 'A@3', 'A.1@4', 'B@5'],
		},
		'annex letters out of order → the second prose': {
			blocks: [
				{ kind: 'annexHeading', letter: 'B', title: 'Second annex' },
				{ kind: 'annexHeading', letter: 'A', title: 'First annex' },
			],
			expected: ['B@1'],
		},
		'a numbered heading after an annex with a longer numbered chain → the annex prose': {
			blocks: [
				heading('1', 'Alpha'),
				{ kind: 'annexHeading', letter: 'A', title: 'First annex' },
				heading('2', 'Beta'),
				heading('3', 'Gamma'),
			],
			expected: ['1@1', '2@3', '3@4'],
		},
		'an annex line with a word before the title → kept': {
			blocks: [
				heading('1', 'Alpha'),
				{
					kind: 'annexHeading',
					letter: 'A',
					title: 'First annex',
					qualifier: { text: 'normative', position: 'before' },
				},
			],
			expected: ['1@1', 'A@2'],
		},
		'an annex line with a word after the title → kept': {
			blocks: [
				heading('1', 'Alpha'),
				{
					kind: 'annexHeading',
					letter: 'A',
					title: 'First annex',
					qualifier: { text: 'informative', position: 'after' },
				},
			],
			expected: ['1@1', 'A@2'],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(keptOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})

describe('headings: ranges, depth, parent and pass', () => {
	const testCases: Record<string, RangeCase> = {
		'a tree with bodies → each range ends before the next heading of its depth or lower': {
			blocks: [
				heading('1', 'Alpha'),
				body(),
				heading('1.1', 'Beta'),
				body(),
				heading('1.2', 'Gamma'),
				body(),
				heading('2', 'Delta'),
				body(),
			],
			expected: [
				{
					id: syntheticId('1'),
					number: '1',
					title: 'Alpha',
					from: 1,
					to: 6,
					depth: 1,
					parent: null,
					pass: 1,
				},
				{
					id: syntheticId('1.1'),
					number: '1.1',
					title: 'Beta',
					from: 3,
					to: 4,
					depth: 2,
					parent: syntheticId('1'),
					pass: 1,
				},
				{
					id: syntheticId('1.2'),
					number: '1.2',
					title: 'Gamma',
					from: 5,
					to: 6,
					depth: 2,
					parent: syntheticId('1'),
					pass: 1,
				},
				{
					id: syntheticId('2'),
					number: '2',
					title: 'Delta',
					from: 7,
					to: 8,
					depth: 1,
					parent: null,
					pass: 1,
				},
			],
		},
		'a third level → the parent is the nearest heading one level up': {
			blocks: [
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
				heading('1.1.1', 'Gamma'),
				heading('1.2', 'Delta'),
				heading('1.2.1', 'Epsilon'),
			],
			expected: [
				{
					id: syntheticId('1'),
					number: '1',
					title: 'Alpha',
					from: 1,
					to: 5,
					depth: 1,
					parent: null,
					pass: 1,
				},
				{
					id: syntheticId('1.1'),
					number: '1.1',
					title: 'Beta',
					from: 2,
					to: 3,
					depth: 2,
					parent: syntheticId('1'),
					pass: 1,
				},
				{
					id: syntheticId('1.1.1'),
					number: '1.1.1',
					title: 'Gamma',
					from: 3,
					to: 3,
					depth: 3,
					parent: syntheticId('1.1'),
					pass: 1,
				},
				{
					id: syntheticId('1.2'),
					number: '1.2',
					title: 'Delta',
					from: 4,
					to: 5,
					depth: 2,
					parent: syntheticId('1'),
					pass: 1,
				},
				{
					id: syntheticId('1.2.1'),
					number: '1.2.1',
					title: 'Epsilon',
					from: 5,
					to: 5,
					depth: 3,
					parent: syntheticId('1.2'),
					pass: 1,
				},
			],
		},
		'a markdown ordered list in the body of a clause → the ranges swallow the list, the parents are as without it':
			{
				blocks: [
					heading('1', 'Alpha'),
					heading('1.1', 'Beta'),
					{ kind: 'raw', lines: ['1. First item', '2. Second item', '3. Third item'] },
					heading('1.2', 'Gamma'),
					heading('2', 'Delta'),
				],
				expected: [
					{
						id: syntheticId('1'),
						number: '1',
						title: 'Alpha',
						from: 1,
						to: 6,
						depth: 1,
						parent: null,
						pass: 1,
					},
					{
						id: syntheticId('1.1'),
						number: '1.1',
						title: 'Beta',
						from: 2,
						to: 5,
						depth: 2,
						parent: syntheticId('1'),
						pass: 1,
					},
					{
						id: syntheticId('1.2'),
						number: '1.2',
						title: 'Gamma',
						from: 6,
						to: 6,
						depth: 2,
						parent: syntheticId('1'),
						pass: 1,
					},
					{
						id: syntheticId('2'),
						number: '2',
						title: 'Delta',
						from: 7,
						to: 7,
						depth: 1,
						parent: null,
						pass: 1,
					},
				],
			},
		'headings behind markers, a sub-number skipping siblings → kept, depth by the number of parts':
			{
				blocks: [
					{ kind: 'heading', number: '5', title: 'Alpha', marker: '## ' },
					{ kind: 'heading', number: '5.3', title: 'Beta', marker: '### ' },
				],
				expected: [
					{
						id: syntheticId('5'),
						number: '5',
						title: 'Alpha',
						from: 1,
						to: 2,
						depth: 1,
						parent: null,
						pass: 1,
					},
					{
						id: syntheticId('5.3'),
						number: '5.3',
						title: 'Beta',
						from: 2,
						to: 2,
						depth: 2,
						parent: syntheticId('5'),
						pass: 1,
					},
				],
			},
		'two passes → the first ends before the second starts, parents stay in their pass': {
			blocks: [
				heading('1', 'Alpha'),
				body(),
				heading('1.1', 'Beta'),
				body(),
				heading('1', 'Gamma'),
				body(),
				heading('1.1', 'Delta'),
				body(),
			],
			expected: [
				{
					id: syntheticId('1'),
					number: '1',
					title: 'Alpha',
					from: 1,
					to: 4,
					depth: 1,
					parent: null,
					pass: 1,
				},
				{
					id: syntheticId('1.1'),
					number: '1.1',
					title: 'Beta',
					from: 3,
					to: 4,
					depth: 2,
					parent: syntheticId('1'),
					pass: 1,
				},
				{
					id: syntheticId('1~2'),
					number: '1',
					title: 'Gamma',
					from: 5,
					to: 8,
					depth: 1,
					parent: null,
					pass: 2,
				},
				{
					id: syntheticId('1.1~2'),
					number: '1.1',
					title: 'Delta',
					from: 7,
					to: 8,
					depth: 2,
					parent: syntheticId('1~2'),
					pass: 2,
				},
			],
		},
		'a file starting at depth 2 → no parent': {
			blocks: [heading('4.1', 'Alpha'), body(), heading('4.2', 'Beta'), body()],
			expected: [
				{
					id: syntheticId('4.1'),
					number: '4.1',
					title: 'Alpha',
					from: 1,
					to: 2,
					depth: 2,
					parent: null,
					pass: 1,
				},
				{
					id: syntheticId('4.2'),
					number: '4.2',
					title: 'Beta',
					from: 3,
					to: 4,
					depth: 2,
					parent: null,
					pass: 1,
				},
			],
		},
		'an annex with sub-numbers → depth by number of parts, the annex letter as parent': {
			blocks: [
				{ kind: 'annexHeading', letter: 'A', title: 'First annex' },
				body(),
				heading('A.1', 'Sub one'),
				body(),
				heading('A.2', 'Sub two'),
				body(),
			],
			expected: [
				{
					id: syntheticId('A'),
					number: 'A',
					title: 'First annex',
					from: 1,
					to: 6,
					depth: 1,
					parent: null,
					pass: 1,
				},
				{
					id: syntheticId('A.1'),
					number: 'A.1',
					title: 'Sub one',
					from: 3,
					to: 4,
					depth: 2,
					parent: syntheticId('A'),
					pass: 1,
				},
				{
					id: syntheticId('A.2'),
					number: 'A.2',
					title: 'Sub two',
					from: 5,
					to: 6,
					depth: 2,
					parent: syntheticId('A'),
					pass: 1,
				},
			],
		},
		'a final line break → adds no line to the last range': {
			blocks: [heading('1', 'Alpha'), { kind: 'raw', lines: ['Body text.', ''] }],
			expected: [
				{
					id: syntheticId('1'),
					number: '1',
					title: 'Alpha',
					from: 1,
					to: 2,
					depth: 1,
					parent: null,
					pass: 1,
				},
			],
		},
		'an annex line with a word before the title → the title without the word': {
			blocks: [
				{
					kind: 'annexHeading',
					letter: 'A',
					title: 'First annex',
					qualifier: { text: 'normative', position: 'before' },
				},
			],
			expected: [
				{
					id: syntheticId('A'),
					number: 'A',
					title: 'First annex',
					from: 1,
					to: 1,
					depth: 1,
					parent: null,
					pass: 1,
				},
			],
		},
		'an annex line with a word after the title → the title without the word': {
			blocks: [
				{
					kind: 'annexHeading',
					letter: 'A',
					title: 'First annex',
					qualifier: { text: 'informative', position: 'after' },
				},
			],
			expected: [
				{
					id: syntheticId('A'),
					number: 'A',
					title: 'First annex',
					from: 1,
					to: 1,
					depth: 1,
					parent: null,
					pass: 1,
				},
			],
		},
		'a marker and a trailing dot → neither in the number nor in the title': {
			blocks: [{ kind: 'raw', lines: ['## 1.  Scope', 'Body text.'] }, heading('2', 'Next')],
			expected: [
				{
					id: syntheticId('1'),
					number: '1',
					title: 'Scope',
					from: 1,
					to: 2,
					depth: 1,
					parent: null,
					pass: 1,
				},
				{
					id: syntheticId('2'),
					number: '2',
					title: 'Next',
					from: 3,
					to: 3,
					depth: 1,
					parent: null,
					pass: 1,
				},
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(headingsOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})
