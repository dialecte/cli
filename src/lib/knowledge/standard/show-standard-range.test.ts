import { indexSyntheticFile } from '../../../../test/search-synthetic-standard.ts'
import { showStandardRange } from './show-standard-range.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardShowAnswer } from './standard-search.types.ts'

type TestCase = {
	blocks: SyntheticBlock[]
	from: number
	to: number
	expected: StandardShowAnswer
}

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

/**
 * Line 1 a heading, lines 2-3 one paragraph, line 4 blank, line 5 a prose line of its own (the file
 * ends there, with no final line break).
 */
const PLAIN_BLOCKS: SyntheticBlock[] = [
	{ kind: 'heading', number: '1', title: 'Alpha' },
	raw('First line.', 'Second line.'),
	{ kind: 'blank' },
	raw('Third line.'),
]

/** Line 1 a heading, lines 2-26 a run of 25 one-character lines (noise), line 27 prose. */
const NOISE_BLOCKS: SyntheticBlock[] = [
	{ kind: 'heading', number: '1', title: 'Alpha' },
	{ kind: 'oneCharacterRun', count: 25 },
	raw('After the noise.'),
]

const HEADING_LINE = { from: 1, to: 1, kind: 'heading', text: '1 Alpha' } as const
const PARAGRAPH_LINE = {
	from: 2,
	to: 3,
	kind: 'prose',
	text: 'First line. Second line.',
} as const
const THIRD_LINE = { from: 5, to: 5, kind: 'prose', text: 'Third line.' } as const
const AFTER_NOISE_LINE = {
	from: 27,
	to: 27,
	kind: 'prose',
	text: 'After the noise.',
} as const

describe('show: the logical lines of a range', () => {
	const testCases: Record<string, TestCase> = {
		'a range inside a two line paragraph → the whole paragraph': {
			blocks: PLAIN_BLOCKS,
			from: 3,
			to: 3,
			expected: { kind: 'lines', lines: [PARAGRAPH_LINE] },
		},
		'a range ending in the second logical line and starting in the first → both, whole': {
			blocks: PLAIN_BLOCKS,
			from: 3,
			to: 5,
			expected: { kind: 'lines', lines: [PARAGRAPH_LINE, THIRD_LINE] },
		},
		'a range of the heading line → the heading, its text as normalised': {
			blocks: PLAIN_BLOCKS,
			from: 1,
			to: 1,
			expected: { kind: 'lines', lines: [HEADING_LINE] },
		},
		'the whole file → every logical line, the blank line between left out': {
			blocks: PLAIN_BLOCKS,
			from: 1,
			to: 5,
			expected: { kind: 'lines', lines: [HEADING_LINE, PARAGRAPH_LINE, THIRD_LINE] },
		},
		'a range of the last line → that line': {
			blocks: PLAIN_BLOCKS,
			from: 5,
			to: 5,
			expected: { kind: 'lines', lines: [THIRD_LINE] },
		},
		'a range holding only a blank line → nothing': {
			blocks: PLAIN_BLOCKS,
			from: 4,
			to: 4,
			expected: { kind: 'nothing' },
		},
		'a range holding only noise lines → nothing': {
			blocks: NOISE_BLOCKS,
			from: 2,
			to: 26,
			expected: { kind: 'nothing' },
		},
		'a range of noise lines and the prose line after them → that line only': {
			blocks: NOISE_BLOCKS,
			from: 2,
			to: 27,
			expected: { kind: 'lines', lines: [AFTER_NOISE_LINE] },
		},
		'a range starting after its end → refused': {
			blocks: PLAIN_BLOCKS,
			from: 3,
			to: 2,
			expected: { kind: 'refused', reason: 'from-after-to' },
		},
		'a range ending after the last line of the file → refused': {
			blocks: PLAIN_BLOCKS,
			from: 4,
			to: 6,
			expected: { kind: 'refused', reason: 'beyond-last-line' },
		},
		'a range wholly after the last line of the file → refused': {
			blocks: PLAIN_BLOCKS,
			from: 6,
			to: 7,
			expected: { kind: 'refused', reason: 'beyond-last-line' },
		},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			expect(
				showStandardRange({
					file: indexSyntheticFile({ file: { blocks: testCase.blocks } }),
					from: testCase.from,
					to: testCase.to,
				}),
			).toEqual(testCase.expected)
		})
	}
})
