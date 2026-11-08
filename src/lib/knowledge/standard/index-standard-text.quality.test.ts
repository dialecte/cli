import { indexSynthetic } from '../../../../test/index-synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type {
	StandardBlockVerdict,
	StandardFileIndex,
	StandardFileVerdict,
	StandardQualityBlock,
} from './standard-index.types.ts'

type VerdictCase = {
	blocks: SyntheticBlock[]
	expected: { verdict: StandardFileVerdict; blocks: StandardQualityBlock[] }
}

type CountsCase = {
	blocks: SyntheticBlock[]
	expected: {
		lineCount: number
		readableLines: number
		droppedLines: number
		headingCandidatesKept: number
		headingCandidatesTurnedProse: number
	}
}

/** A block of `lines` original lines holding `dropped` one-character lines, the rest unique prose. */
function blockOf(params: {
	from: number
	lines: number
	dropped: number
	verdict: StandardBlockVerdict
}): StandardQualityBlock {
	const { from, lines, dropped, verdict } = params
	return { from, to: from + lines - 1, lines, dropped, noiseRatio: dropped / lines, verdict }
}

function noisyLines(params: { dropped: number; total: number }): SyntheticBlock[] {
	return [
		{ kind: 'oneCharacterRun', count: params.dropped },
		{ kind: 'filler', count: params.total - params.dropped },
	]
}

function verdictsOf(index: StandardFileIndex): VerdictCase['expected'] {
	const { quality } = index
	return {
		verdict: quality.verdict,
		blocks: quality.blocks.map(({ from, to, lines, dropped, noiseRatio, verdict }) => ({
			from,
			to,
			lines,
			dropped,
			noiseRatio,
			verdict,
		})),
	}
}

function countsOf(index: StandardFileIndex): CountsCase['expected'] {
	return {
		lineCount: index.lineCount,
		readableLines: index.quality.readableLines,
		droppedLines: index.quality.droppedLines,
		headingCandidatesKept: index.quality.headingCandidatesKept,
		headingCandidatesTurnedProse: index.quality.headingCandidatesTurnedProse,
	}
}

describe('quality: block noise thresholds and the file verdict', () => {
	const testCases: Record<string, VerdictCase> = {
		'199 of 1000 lines dropped → block good, file good': {
			blocks: noisyLines({ dropped: 199, total: 1000 }),
			expected: {
				verdict: 'good',
				blocks: [blockOf({ from: 1, lines: 1000, dropped: 199, verdict: 'good' })],
			},
		},
		'200 of 1000 lines dropped → block poor, file partial': {
			blocks: noisyLines({ dropped: 200, total: 1000 }),
			expected: {
				verdict: 'partial',
				blocks: [blockOf({ from: 1, lines: 1000, dropped: 200, verdict: 'poor' })],
			},
		},
		'699 of 1000 lines dropped → block poor, file partial': {
			blocks: noisyLines({ dropped: 699, total: 1000 }),
			expected: {
				verdict: 'partial',
				blocks: [blockOf({ from: 1, lines: 1000, dropped: 699, verdict: 'poor' })],
			},
		},
		'700 of 1000 lines dropped → block unreadable, file unreadable': {
			blocks: noisyLines({ dropped: 700, total: 1000 }),
			expected: {
				verdict: 'unreadable',
				blocks: [blockOf({ from: 1, lines: 1000, dropped: 700, verdict: 'unreadable' })],
			},
		},
		'a good block then a short block of 20 dropped lines → blocks good and unreadable, file partial':
			{
				blocks: [
					{ kind: 'filler', count: 1000 },
					{ kind: 'oneCharacterRun', count: 20 },
				],
				expected: {
					verdict: 'partial',
					blocks: [
						blockOf({ from: 1, lines: 1000, dropped: 0, verdict: 'good' }),
						blockOf({ from: 1001, lines: 20, dropped: 20, verdict: 'unreadable' }),
					],
				},
			},
		'every block unreadable → file unreadable': {
			blocks: [{ kind: 'oneCharacterRun', count: 1020 }],
			expected: {
				verdict: 'unreadable',
				blocks: [
					blockOf({ from: 1, lines: 1000, dropped: 1000, verdict: 'unreadable' }),
					blockOf({ from: 1001, lines: 20, dropped: 20, verdict: 'unreadable' }),
				],
			},
		},
		'a file of 1010 lines with no noise → two good blocks, the last shorter, file good': {
			blocks: [{ kind: 'filler', count: 1010 }],
			expected: {
				verdict: 'good',
				blocks: [
					blockOf({ from: 1, lines: 1000, dropped: 0, verdict: 'good' }),
					blockOf({ from: 1001, lines: 10, dropped: 0, verdict: 'good' }),
				],
			},
		},
		'1000 lines and a final line break → one block, the break adds no line': {
			blocks: [
				{ kind: 'filler', count: 1000 },
				{ kind: 'raw', lines: [''] },
			],
			expected: {
				verdict: 'good',
				blocks: [blockOf({ from: 1, lines: 1000, dropped: 0, verdict: 'good' })],
			},
		},
		'a poor block and a good block → file partial': {
			blocks: [...noisyLines({ dropped: 300, total: 1000 }), { kind: 'filler', count: 500 }],
			expected: {
				verdict: 'partial',
				blocks: [
					blockOf({ from: 1, lines: 1000, dropped: 300, verdict: 'poor' }),
					blockOf({ from: 1001, lines: 500, dropped: 0, verdict: 'good' }),
				],
			},
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(verdictsOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})

describe('quality: the counts of a file', () => {
	const testCases: Record<string, CountsCase> = {
		'blank and dropped lines → not readable, the others readable': {
			blocks: [
				{ kind: 'raw', lines: ['First.', ''] },
				{ kind: 'oneCharacterRun', count: 20 },
				{ kind: 'raw', lines: ['Second.', '  '] },
			],
			expected: {
				lineCount: 24,
				readableLines: 2,
				droppedLines: 20,
				headingCandidatesKept: 0,
				headingCandidatesTurnedProse: 0,
			},
		},
		'two lines and a final line break → two lines': {
			blocks: [{ kind: 'raw', lines: ['First.', 'Second.', ''] }],
			expected: {
				lineCount: 2,
				readableLines: 2,
				droppedLines: 0,
				headingCandidatesKept: 0,
				headingCandidatesTurnedProse: 0,
			},
		},
		'heading candidates, one out of order → counted kept and turned prose': {
			blocks: [
				{ kind: 'heading', number: '1', title: 'Alpha' },
				{ kind: 'heading', number: '2', title: 'Beta' },
				{ kind: 'heading', number: '9', title: 'Gamma' },
				{ kind: 'heading', number: '3', title: 'Delta' },
			],
			expected: {
				lineCount: 4,
				readableLines: 4,
				droppedLines: 0,
				headingCandidatesKept: 3,
				headingCandidatesTurnedProse: 1,
			},
		},
		'a markdown ordered list after undotted headings → its three lines counted turned prose': {
			blocks: [
				{ kind: 'heading', number: '1', title: 'Alpha' },
				{ kind: 'heading', number: '2', title: 'Beta' },
				{ kind: 'raw', lines: ['1. First item', '2. Second item', '3. Third item'] },
			],
			expected: {
				lineCount: 5,
				readableLines: 5,
				droppedLines: 0,
				headingCandidatesKept: 2,
				headingCandidatesTurnedProse: 3,
			},
		},
		'a number above 50 → not a candidate, neither kept nor turned prose': {
			blocks: [
				{ kind: 'heading', number: '1', title: 'Alpha' },
				{ kind: 'heading', number: '1672', title: 'Change entry' },
			],
			expected: {
				lineCount: 2,
				readableLines: 2,
				droppedLines: 0,
				headingCandidatesKept: 1,
				headingCandidatesTurnedProse: 0,
			},
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(countsOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})
