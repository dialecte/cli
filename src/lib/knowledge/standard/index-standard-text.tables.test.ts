import { indexSynthetic, syntheticId } from '../../../../test/index-synthetic-standard.ts'
import { captionLine } from '../../../../test/synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardFileIndex, StandardTable } from './standard-index.types.ts'

type TestCase = {
	blocks: SyntheticBlock[]
	expected: StandardTable[]
}

const SAMPLE_CAPTION = captionLine({ word: 'table', number: '1', title: 'Sample values' })

function heading(number: string, title: string): SyntheticBlock {
	return { kind: 'heading', number, title }
}

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

function sampleCaption(number: string): SyntheticBlock {
	return { kind: 'caption', word: 'table', number, title: 'Sample values' }
}

function sampleTable(): SyntheticBlock {
	return {
		kind: 'table',
		columns: ['Name', 'Value'],
		rows: [
			['a', '1'],
			['b', '2'],
		],
	}
}

/** A table of one line (its header row), so a caption above stays within the lookback of a later table. */
function headerOnlyTable(): SyntheticBlock {
	return { kind: 'table', columns: ['Name', 'Value'], rows: [], withSeparator: false }
}

/** `count` prose lines, each its own logical line (a blank line after each). */
function separatedProse(count: number): SyntheticBlock[] {
	return Array.from({ length: count }, (_unused, index) => raw(`Prose ${index + 1}.`, ''))
}

function tablesOf(index: StandardFileIndex): StandardTable[] {
	return index.tables
}

describe('tables and their captions', () => {
	const testCases: Record<string, TestCase> = {
		'a table right under its caption inside a clause → caption, number, range, clause, columns': {
			blocks: [heading('1', 'Alpha'), sampleCaption('1'), sampleTable()],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: SAMPLE_CAPTION,
					number: '1',
					from: 3,
					to: 6,
					clause: '1',
					columns: ['Name', 'Value'],
				},
			],
		},
		'a table without a separator row → columns from the first row': {
			blocks: [
				heading('1', 'Alpha'),
				{ kind: 'table', columns: ['Name', 'Value'], rows: [['a', '1']], withSeparator: false },
			],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: null,
					number: null,
					from: 2,
					to: 3,
					clause: '1',
					columns: ['Name', 'Value'],
				},
			],
		},
		'a table with no caption → caption and number null': {
			blocks: [heading('1', 'Alpha'), sampleTable()],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: null,
					number: null,
					from: 2,
					to: 5,
					clause: '1',
					columns: ['Name', 'Value'],
				},
			],
		},
		'a caption 5 logical lines above → found': {
			blocks: [sampleCaption('1'), raw(''), ...separatedProse(4), sampleTable()],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: SAMPLE_CAPTION,
					number: '1',
					from: 11,
					to: 14,
					clause: null,
					columns: ['Name', 'Value'],
				},
			],
		},
		'a caption 6 logical lines above → not found': {
			blocks: [sampleCaption('1'), raw(''), ...separatedProse(5), sampleTable()],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: null,
					number: null,
					from: 13,
					to: 16,
					clause: null,
					columns: ['Name', 'Value'],
				},
			],
		},
		'a figure caption right above → not the caption of the table': {
			blocks: [{ kind: 'caption', word: 'figure', number: '1', title: 'Layout' }, sampleTable()],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: null,
					number: null,
					from: 2,
					to: 5,
					clause: null,
					columns: ['Name', 'Value'],
				},
			],
		},
		'a caption, a table, a line, a second table with no caption → the second table has no caption nor number':
			{
				blocks: [sampleCaption('1'), headerOnlyTable(), raw('Prose.'), headerOnlyTable()],
				expected: [
					{
						id: syntheticId('table-1'),
						caption: SAMPLE_CAPTION,
						number: '1',
						from: 2,
						to: 2,
						clause: null,
						columns: ['Name', 'Value'],
					},
					{
						id: syntheticId('table-2'),
						caption: null,
						number: null,
						from: 4,
						to: 4,
						clause: null,
						columns: ['Name', 'Value'],
					},
				],
			},
		'a table caption, then a figure caption, then the table → the table caption wins': {
			blocks: [
				sampleCaption('1'),
				{ kind: 'caption', word: 'figure', number: '1', title: 'Layout' },
				sampleTable(),
			],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: SAMPLE_CAPTION,
					number: '1',
					from: 3,
					to: 6,
					clause: null,
					columns: ['Name', 'Value'],
				},
			],
		},
		'a caption with an en dash → the caption text with the dash folded': {
			blocks: [
				{
					kind: 'caption',
					word: 'table',
					number: '1',
					title: 'Sample values',
					separator: ' \u2013 ',
				},
				sampleTable(),
			],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: SAMPLE_CAPTION,
					number: '1',
					from: 2,
					to: 5,
					clause: null,
					columns: ['Name', 'Value'],
				},
			],
		},
		'a separator row with alignment colons → skipped, columns from the first row': {
			blocks: [raw('| a | b |', '|:---|---:|', '| 1 | 2 |')],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: null,
					number: null,
					from: 1,
					to: 3,
					clause: null,
					columns: ['a', 'b'],
				},
			],
		},
		'two captions above → the nearest one': {
			blocks: [
				{ kind: 'caption', word: 'table', number: '1', title: 'Earlier' },
				raw('Between.', ''),
				{ kind: 'caption', word: 'table', number: '2', title: 'Nearer' },
				sampleTable(),
			],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: captionLine({ word: 'table', number: '2', title: 'Nearer' }),
					number: '2',
					from: 5,
					to: 8,
					clause: null,
					columns: ['Name', 'Value'],
				},
			],
		},
		'two tables → ids by position in the file, caption numbers of their own': {
			blocks: [
				sampleCaption('5'),
				{ kind: 'table', columns: ['A', 'B'], rows: [['1', '2']], withSeparator: false },
				raw(''),
				sampleCaption('2'),
				{ kind: 'table', columns: ['C', 'D'], rows: [['3', '4']], withSeparator: false },
			],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: captionLine({ word: 'table', number: '5', title: 'Sample values' }),
					number: '5',
					from: 2,
					to: 3,
					clause: null,
					columns: ['A', 'B'],
				},
				{
					id: syntheticId('table-2'),
					caption: captionLine({ word: 'table', number: '2', title: 'Sample values' }),
					number: '2',
					from: 6,
					to: 7,
					clause: null,
					columns: ['C', 'D'],
				},
			],
		},
		'a blank line inside a table → two tables': {
			blocks: [raw('| a | b |', '| 1 | 2 |', '', '| c | d |', '| 3 | 4 |')],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: null,
					number: null,
					from: 1,
					to: 2,
					clause: null,
					columns: ['a', 'b'],
				},
				{
					id: syntheticId('table-2'),
					caption: null,
					number: null,
					from: 4,
					to: 5,
					clause: null,
					columns: ['c', 'd'],
				},
			],
		},
		'a table under a sub-heading → the clause is the sub-heading number': {
			blocks: [heading('1', 'Alpha'), heading('1.1', 'Beta'), sampleTable()],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: null,
					number: null,
					from: 3,
					to: 6,
					clause: '1.1',
					columns: ['Name', 'Value'],
				},
			],
		},
		'a table before the first heading → clause null': {
			blocks: [sampleTable(), heading('1', 'Alpha')],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: null,
					number: null,
					from: 1,
					to: 4,
					clause: null,
					columns: ['Name', 'Value'],
				},
			],
		},
		'an empty header cell → kept as an empty column name': {
			blocks: [raw('| a |  | c |', '| 1 | 2 | 3 |')],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: null,
					number: null,
					from: 1,
					to: 2,
					clause: null,
					columns: ['a', '', 'c'],
				},
			],
		},
		'a caption with a lettered number → the number as written': {
			blocks: [sampleCaption('A.1'), sampleTable()],
			expected: [
				{
					id: syntheticId('table-1'),
					caption: captionLine({ word: 'table', number: 'A.1', title: 'Sample values' }),
					number: 'A.1',
					from: 2,
					to: 5,
					clause: null,
					columns: ['Name', 'Value'],
				},
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(tablesOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})
