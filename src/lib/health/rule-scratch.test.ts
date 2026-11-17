import {
	DAY_MS,
	HOUR_MS,
	SCRATCH_LEAK_SPEC_MS,
	WORKTREES_NOW,
} from '../../../test/health-worktrees.constants.ts'
import { scratchFinding, scratchFoldersOf } from '../../../test/health-worktrees.ts'
import { SCRATCH_LEAK_MS } from './health.constants.ts'
import { findLeakedScratch } from './rule-scratch.ts'

import { describe, expect, it } from 'vitest'

import type { ScratchCase } from '../../../test/health-worktrees.types.ts'

const cases: ScratchCase[] = [
	{
		name: 'a 7 h old dialecte-rehearse-x -> amber, one leaked folder',
		folders: [{ name: 'dialecte-rehearse-x', ageMs: 7 * HOUR_MS }],
		expected: [
			scratchFinding({
				text: '1 leaked scratch folder (oldest /tmp/dialecte-rehearse-x, 7 h 0 m old)',
				detail: ['/tmp/dialecte-rehearse-x'],
			}),
		],
	},
	{
		name: 'a 1 h old folder -> nothing',
		folders: [{ name: 'dialecte-rehearse-x', ageMs: HOUR_MS }],
		expected: [],
	},
	{
		name: 'exactly 6 h old -> nothing',
		folders: [{ name: 'dialecte-rehearse-x', ageMs: SCRATCH_LEAK_SPEC_MS }],
		expected: [],
	},
	{
		name: '6 h + 1 ms old -> amber',
		folders: [{ name: 'dialecte-rehearse-x', ageMs: SCRATCH_LEAK_SPEC_MS + 1 }],
		expected: [
			scratchFinding({
				text: '1 leaked scratch folder (oldest /tmp/dialecte-rehearse-x, 6 h 0 m old)',
				detail: ['/tmp/dialecte-rehearse-x'],
			}),
		],
	},
	{
		name: 'no folder -> nothing',
		folders: [],
		expected: [],
	},
	{
		name: 'two leaked, the newer listed first -> oldest first, the old one named',
		folders: [
			{ name: 'dialecte-hook-b', ageMs: 8 * HOUR_MS },
			{ name: 'dialecte-probe-a', ageMs: DAY_MS },
		],
		expected: [
			scratchFinding({
				text: '2 leaked scratch folders (oldest /tmp/dialecte-probe-a, 24 h 0 m old)',
				detail: ['/tmp/dialecte-probe-a', '/tmp/dialecte-hook-b'],
			}),
		],
	},
	{
		name: 'a leaked folder among a fresh one -> only the leaked one counted',
		folders: [
			{ name: 'dialecte-hook-b', ageMs: HOUR_MS },
			{ name: 'dialecte-probe-a', ageMs: 9 * HOUR_MS },
		],
		expected: [
			scratchFinding({
				text: '1 leaked scratch folder (oldest /tmp/dialecte-probe-a, 9 h 0 m old)',
				detail: ['/tmp/dialecte-probe-a'],
			}),
		],
	},
]

describe('findLeakedScratch thresholds', () => {
	it('a scratch folder is leaked after 6 h', () => {
		expect(SCRATCH_LEAK_MS).toBe(SCRATCH_LEAK_SPEC_MS)
	})
})

describe('findLeakedScratch', () => {
	it.each(cases)('$name', ({ folders, expected }) => {
		expect(findLeakedScratch({ folders: scratchFoldersOf(folders), now: WORKTREES_NOW })).toEqual(
			expected,
		)
	})
})

describe('findLeakedScratch: a folder whose scratch.json names a live process', () => {
	it('a 7 h old folder whose process still runs → nothing (a long rehearsal is no leak)', () => {
		expect(
			findLeakedScratch({
				folders: [
					{
						path: '/scratch/dialecte-rehearse-x',
						modifiedAt: new Date(WORKTREES_NOW.getTime() - 7 * HOUR_MS).toISOString(),
						pid: 4242,
					},
				],
				now: WORKTREES_NOW,
				isAlive: (pid) => pid === 4242,
			}),
		).toEqual([])
	})
})
