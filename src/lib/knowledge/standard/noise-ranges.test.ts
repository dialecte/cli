import { indexSynthetic } from '../../../../test/index-synthetic-standard.ts'
import { codeLines, findSynthetic, padded } from '../../../../test/search-synthetic-standard.ts'
import { oneCharacterLines } from '../../../../test/synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardFileIndex } from './standard-index.types.ts'

type LineRange = { from: number; to: number }

/** The index as the step's code gives it: with the ranges of the dropped one-character runs. */
type IndexWithNoiseRanges = StandardFileIndex & { noiseRanges: LineRange[] }

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

function blank(count?: number): SyntheticBlock {
	return { kind: 'blank', count }
}

function heading(number: string, title: string): SyntheticBlock {
	return { kind: 'heading', number, title }
}

const HIT = 'zorbit'
const FILLER = 'filler'

describe('indexStandardText: the ranges of the dropped one-character runs', () => {
	const testCases: Record<string, { blocks: SyntheticBlock[]; expected: LineRange[] }> = {
		'a run of 20 one-character lines between sentences → its lines': {
			blocks: [
				raw('Intro line.'),
				blank(),
				raw(...oneCharacterLines(20)),
				blank(),
				raw('After line.'),
			],
			expected: [{ from: 3, to: 22 }],
		},
		'a run of 19 → no range, nothing dropped': {
			blocks: [
				raw('Intro line.'),
				blank(),
				raw(...oneCharacterLines(19)),
				blank(),
				raw('After line.'),
			],
			expected: [],
		},
		'two runs of 10 with 25 blank lines between them → one range, the blank lines inside it included':
			{
				blocks: [
					raw('Intro line.'),
					blank(),
					raw(...oneCharacterLines(10)),
					blank(25),
					raw(...oneCharacterLines(10)),
					blank(),
					raw('After line.'),
				],
				expected: [{ from: 3, to: 47 }],
			},
		'two runs of 20 apart, a sentence between them → two ranges in file order': {
			blocks: [
				raw(...oneCharacterLines(20)),
				raw('Middle sentence here.'),
				raw(...oneCharacterLines(22)),
			],
			expected: [
				{ from: 1, to: 20 },
				{ from: 22, to: 43 },
			],
		},
		'a text with no one-character line → no range': {
			blocks: [heading('1', 'Overview'), raw('A sentence.')],
			expected: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(
				(indexSynthetic({ blocks: testCase.blocks }) as IndexWithNoiseRanges).noiseRanges,
			).toEqual(testCase.expected)
		})
})

describe('find: the 60-line cap counts every original line but the dropped ones', () => {
	it('two hits with a 25-blank-line gap between them, 61 lines counted → the window stops at line 61, the blank lines counted', () => {
		// heading 1, hit 2, blank 3-27, 36 filler code lines 28-63, hit 64
		const slices = findSynthetic({
			standards: padded([
				heading('1', 'Region'),
				...codeLines([HIT]),
				blank(25),
				...codeLines([...Array.from({ length: 36 }, () => FILLER), HIT]),
			]),
			query: HIT,
		})

		expect(slices.map(({ from, to }) => ({ from, to }))).toEqual([{ from: 2, to: 61 }])
	})

	it('a joined paragraph holding a dropped run of 30 lines, then a hit 40 lines later → 44 lines counted, the slice whole', () => {
		// heading 1, paragraph 2-33 (line 2 hit, 30 dropped lines 3-32, line 33), blank 34, 40 code lines 35-74, hit 75
		const slices = findSynthetic({
			standards: padded([
				heading('1', 'Region'),
				raw(`alpha ${HIT}`, ...oneCharacterLines(30), 'omega'),
				blank(),
				...codeLines([...Array.from({ length: 40 }, () => FILLER), HIT]),
			]),
			query: HIT,
		})

		expect(slices.map(({ from, to }) => ({ from, to }))).toEqual([{ from: 2, to: 75 }])
	})
})
