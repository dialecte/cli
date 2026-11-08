import { indexSynthetic } from '../../../../test/index-synthetic-standard.ts'
import { evenGaps, oneCharacterLines } from '../../../../test/synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type {
	StandardFileIndex,
	StandardLineKind,
	StandardRepeatedLine,
} from './standard-index.types.ts'

type NoiseCase = {
	blocks: SyntheticBlock[]
	expected: {
		droppedLines: number
		logicalLines: { from: number; to: number; kind: StandardLineKind; text: string }[]
	}
}

type KeptCase = {
	blocks: SyntheticBlock[]
	copyText: string
	copyKind: StandardLineKind
	expected: {
		droppedLines: number
		keptCopies: number
		repeatedLines: StandardRepeatedLine[]
	}
}

type RepeatedCase = {
	blocks: SyntheticBlock[]
	expected: StandardRepeatedLine[]
}

const TABLE_ROW = '| Name | Value |'
const CLOSING_LINE = '</D>'
const LICENCE_LINE = 'This text is shared under invented terms of use.'
const GROUP_LABEL = 'Group Alpha'

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

function letters(count: number): string {
	return oneCharacterLines(count).join(' ')
}

function groupBlocks(count: number): SyntheticBlock[] {
	return Array.from({ length: count }, (_unused, index) => [
		{ kind: 'blank' as const },
		raw(GROUP_LABEL),
		raw(`| Row ${index} | ${index} |`),
		{ kind: 'blank' as const },
		{ kind: 'filler' as const, count: 26 },
	]).flat()
}

function pairedCodeLines(count: number): string[] {
	return Array.from({ length: count }, () => ['<D a="1">', CLOSING_LINE]).flat()
}

function noiseOf(index: StandardFileIndex): NoiseCase['expected'] {
	return { droppedLines: index.quality.droppedLines, logicalLines: index.logicalLines }
}

function keptOf(params: { index: StandardFileIndex; testCase: KeptCase }): KeptCase['expected'] {
	const { index, testCase } = params
	const copies = index.logicalLines.filter(
		(line) => line.text === testCase.copyText && line.kind === testCase.copyKind,
	)
	return {
		droppedLines: index.quality.droppedLines,
		keptCopies: copies.length,
		repeatedLines: index.quality.repeatedLines,
	}
}

function repeatedOf(index: StandardFileIndex): StandardRepeatedLine[] {
	return index.quality.repeatedLines
}

describe('noise: a run of one-character lines', () => {
	const testCases: Record<string, NoiseCase> = {
		'19 one-character lines → kept as one logical line': {
			blocks: [{ kind: 'oneCharacterRun', count: 19 }],
			expected: {
				droppedLines: 0,
				logicalLines: [{ from: 1, to: 19, kind: 'prose', text: letters(19) }],
			},
		},
		'20 one-character lines → dropped': {
			blocks: [{ kind: 'oneCharacterRun', count: 20 }],
			expected: { droppedLines: 20, logicalLines: [] },
		},
		'25 one-character lines → dropped': {
			blocks: [{ kind: 'oneCharacterRun', count: 25 }],
			expected: { droppedLines: 25, logicalLines: [] },
		},
		'10 one-character lines, a blank line, 10 more → dropped, the blank does not break the run': {
			blocks: [
				{ kind: 'oneCharacterRun', count: 10 },
				{ kind: 'blank' },
				{ kind: 'oneCharacterRun', count: 10 },
			],
			expected: { droppedLines: 20, logicalLines: [] },
		},
		'19 one-character lines, a blank line, 1 more → dropped, the blank does not count': {
			blocks: [
				{ kind: 'oneCharacterRun', count: 19 },
				{ kind: 'blank' },
				{ kind: 'oneCharacterRun', count: 1 },
			],
			expected: { droppedLines: 20, logicalLines: [] },
		},
		'10 one-character lines, a blank line, 9 more → kept, the blank does not count': {
			blocks: [
				{ kind: 'oneCharacterRun', count: 10 },
				{ kind: 'blank' },
				{ kind: 'oneCharacterRun', count: 9 },
			],
			expected: {
				droppedLines: 0,
				logicalLines: [
					{ from: 1, to: 10, kind: 'prose', text: letters(10) },
					{ from: 12, to: 20, kind: 'prose', text: letters(9) },
				],
			},
		},
		'10 one-character lines, a two-character line, 10 more → kept, the line breaks the run': {
			blocks: [
				{ kind: 'oneCharacterRun', count: 10 },
				raw('ab'),
				{ kind: 'oneCharacterRun', count: 10 },
			],
			expected: {
				droppedLines: 0,
				logicalLines: [
					{ from: 1, to: 21, kind: 'prose', text: `${letters(10)} ab ${letters(10)}` },
				],
			},
		},
		'20 one-character lines of code → kept, only prose lines are noise': {
			blocks: [raw(...Array.from({ length: 20 }, () => '<'))],
			expected: {
				droppedLines: 0,
				logicalLines: Array.from({ length: 20 }, (_unused, index) => ({
					from: index + 1,
					to: index + 1,
					kind: 'code' as const,
					text: '<',
				})),
			},
		},
		'a dropped run between two paragraphs → the paragraphs stay': {
			blocks: [
				raw('Before the run.', ''),
				{ kind: 'oneCharacterRun', count: 20 },
				raw('', 'After the run.'),
			],
			expected: {
				droppedLines: 20,
				logicalLines: [
					{ from: 1, to: 1, kind: 'prose', text: 'Before the run.' },
					{ from: 24, to: 24, kind: 'prose', text: 'After the run.' },
				],
			},
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(noiseOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})

describe('noise: nothing is dropped for repetition, a repeated line is only reported', () => {
	const testCases: Record<string, KeptCase> = {
		'a table row repeated 60 times at page cadence → all kept, reported with count, length and gap':
			{
				blocks: [
					{ kind: 'repeated', line: TABLE_ROW, gaps: evenGaps({ occurrences: 60, gap: 30 }) },
				],
				copyText: TABLE_ROW,
				copyKind: 'table',
				expected: {
					droppedLines: 0,
					keptCopies: 60,
					repeatedLines: [{ text: TABLE_ROW, count: 60, length: TABLE_ROW.length, medianGap: 30 }],
				},
			},
		'closing code lines repeated 300 times in pairs → all kept, a gap of 2 is not reported': {
			blocks: [raw(...pairedCodeLines(300))],
			copyText: CLOSING_LINE,
			copyKind: 'code',
			expected: { droppedLines: 0, keptCopies: 300, repeatedLines: [] },
		},
		'closing code lines repeated 300 times at page cadence → all kept, reported': {
			blocks: [
				{ kind: 'repeated', line: CLOSING_LINE, gaps: evenGaps({ occurrences: 300, gap: 30 }) },
			],
			copyText: CLOSING_LINE,
			copyKind: 'code',
			expected: {
				droppedLines: 0,
				keptCopies: 300,
				repeatedLines: [
					{ text: CLOSING_LINE, count: 300, length: CLOSING_LINE.length, medianGap: 30 },
				],
			},
		},
		'a licence line once per page → all kept, reported with count, length and gap': {
			blocks: [
				{
					kind: 'repeated',
					line: LICENCE_LINE,
					gaps: evenGaps({ occurrences: 25, gap: 40 }),
					isolated: true,
				},
			],
			copyText: LICENCE_LINE,
			copyKind: 'prose',
			expected: {
				droppedLines: 0,
				keptCopies: 25,
				repeatedLines: [
					{ text: LICENCE_LINE, count: 25, length: LICENCE_LINE.length, medianGap: 40 },
				],
			},
		},
		'a group label above every table at page cadence → all kept, reported only': {
			blocks: groupBlocks(25),
			copyText: GROUP_LABEL,
			copyKind: 'prose',
			expected: {
				droppedLines: 0,
				keptCopies: 25,
				repeatedLines: [
					{ text: GROUP_LABEL, count: 25, length: GROUP_LABEL.length, medianGap: 30 },
				],
			},
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(keptOf({ index: indexSynthetic({ blocks: testCase.blocks }), testCase })).toEqual(
				testCase.expected,
			)
		})
})

describe('noise: repeated-line candidates', () => {
	const testCases: Record<string, RepeatedCase> = {
		'20 occurrences with a median gap of 20 → reported': {
			blocks: [
				{ kind: 'repeated', line: LICENCE_LINE, gaps: evenGaps({ occurrences: 20, gap: 20 }) },
			],
			expected: [{ text: LICENCE_LINE, count: 20, length: LICENCE_LINE.length, medianGap: 20 }],
		},
		'19 occurrences with a gap of 30 → not reported': {
			blocks: [
				{ kind: 'repeated', line: LICENCE_LINE, gaps: evenGaps({ occurrences: 19, gap: 30 }) },
			],
			expected: [],
		},
		'20 occurrences with a median gap of 19 → not reported': {
			blocks: [
				{ kind: 'repeated', line: LICENCE_LINE, gaps: evenGaps({ occurrences: 20, gap: 19 }) },
			],
			expected: [],
		},
		'a median gap below 20 although some gaps are large → not reported': {
			blocks: [
				{
					kind: 'repeated',
					line: LICENCE_LINE,
					gaps: [...Array.from({ length: 10 }, () => 5), ...Array.from({ length: 9 }, () => 40)],
				},
			],
			expected: [],
		},
		'a median gap of 40 although some gaps are small → reported with the median': {
			blocks: [
				{
					kind: 'repeated',
					line: LICENCE_LINE,
					gaps: [...Array.from({ length: 9 }, () => 5), ...Array.from({ length: 10 }, () => 40)],
				},
			],
			expected: [{ text: LICENCE_LINE, count: 20, length: LICENCE_LINE.length, medianGap: 40 }],
		},
		'20 gaps, the two middle ones 19 and 40 → the lower middle, 19, not reported': {
			blocks: [
				{
					kind: 'repeated',
					line: LICENCE_LINE,
					gaps: [...Array.from({ length: 10 }, () => 19), ...Array.from({ length: 10 }, () => 40)],
				},
			],
			expected: [],
		},
		'20 gaps, the two middle ones 20 and 40 → the lower middle, 20, reported': {
			blocks: [
				{
					kind: 'repeated',
					line: LICENCE_LINE,
					gaps: [...Array.from({ length: 10 }, () => 20), ...Array.from({ length: 10 }, () => 40)],
				},
			],
			expected: [{ text: LICENCE_LINE, count: 21, length: LICENCE_LINE.length, medianGap: 20 }],
		},
		'a separator row with alignment colons repeated 25 times → not reported': {
			blocks: [
				{ kind: 'repeated', line: '|:---|---:|', gaps: evenGaps({ occurrences: 25, gap: 30 }) },
			],
			expected: [],
		},
		'a table separator row repeated 25 times → not reported': {
			blocks: [
				{ kind: 'repeated', line: '|---|---|', gaps: evenGaps({ occurrences: 25, gap: 30 }) },
			],
			expected: [],
		},
		'a one-character line repeated 25 times at page cadence → not reported': {
			blocks: [{ kind: 'repeated', line: 'x', gaps: evenGaps({ occurrences: 25, gap: 30 }) }],
			expected: [],
		},
		'copies with leading spaces → counted on the trimmed text': {
			blocks: [
				{
					kind: 'repeated',
					line: `   ${LICENCE_LINE}`,
					gaps: evenGaps({ occurrences: 20, gap: 25 }),
					isolated: true,
				},
			],
			expected: [{ text: LICENCE_LINE, count: 20, length: LICENCE_LINE.length, medianGap: 25 }],
		},
		'several candidates → sorted by count descending, then by text': {
			blocks: [
				{
					kind: 'repeated',
					line: 'Beta line is repeated',
					gaps: evenGaps({ occurrences: 20, gap: 25 }),
				},
				{
					kind: 'repeated',
					line: 'Gamma line is repeated',
					gaps: evenGaps({ occurrences: 30, gap: 25 }),
				},
				{
					kind: 'repeated',
					line: 'Alpha line is repeated',
					gaps: evenGaps({ occurrences: 20, gap: 25 }),
				},
			],
			expected: [
				{ text: 'Gamma line is repeated', count: 30, length: 22, medianGap: 25 },
				{ text: 'Alpha line is repeated', count: 20, length: 22, medianGap: 25 },
				{ text: 'Beta line is repeated', count: 20, length: 21, medianGap: 25 },
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(repeatedOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})
