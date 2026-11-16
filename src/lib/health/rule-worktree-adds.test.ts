import { WORKTREE_ADD_BUDGET_SPEC_MS } from '../../../test/health-worktrees.constants.ts'
import { addFinding, addsRepositoryOf } from '../../../test/health-worktrees.ts'
import { WINDOW } from '../../../test/health.constants.ts'
import { WORKTREE_ADD_BUDGET_MS } from './health.constants.ts'
import { findSlowWorktreeAdds } from './rule-worktree-adds.ts'

import { describe, expect, it } from 'vitest'

import type { AddCase } from '../../../test/health-worktrees.types.ts'

const SIX_AM = '2026-11-15T06:00:00.000Z'
const SEVEN_AM = '2026-11-15T07:00:00.000Z'
const SIX_AM_START = '2026-11-15T05:46:37.000Z'
const SEVEN_AM_START = '2026-11-15T06:52:21.000Z'
const SCL_LOT = '0053-scl-worktree'
const CORE_LOT = '0074-core-worktree'

const cases: AddCase[] = [
	{
		name: 'worktree-add 803 s, node_modules cloned -> amber with node_modules cloned',
		adds: [
			{
				step: 'worktree-add',
				durationMs: 803_000,
				endAt: SIX_AM,
				parts: { nodeModules: 'cloned' },
			},
		],
		expected: [
			addFinding({
				at: SIX_AM_START,
				text: 'worktree-add took 13 m 23 s',
				detail: ['node_modules cloned'],
			}),
		],
	},
	{
		name: 'worktree-add 3.8 s, pooled -> nothing',
		adds: [
			{ step: 'worktree-add', durationMs: 3_800, endAt: SIX_AM, parts: { nodeModules: 'pooled' } },
		],
		expected: [],
	},
	{
		name: 'worktree-add exactly 60 s -> nothing',
		adds: [{ step: 'worktree-add', durationMs: WORKTREE_ADD_BUDGET_SPEC_MS, endAt: SIX_AM }],
		expected: [],
	},
	{
		name: 'worktree-add 60 s + 1 ms -> amber',
		adds: [{ step: 'worktree-add', durationMs: WORKTREE_ADD_BUDGET_SPEC_MS + 1, endAt: SIX_AM }],
		expected: [addFinding({ at: '2026-11-15T05:58:59.999Z', text: 'worktree-add took 1 m 0 s' })],
	},
	{
		name: 'throwaway-add 459 s with no parts -> amber, no detail',
		adds: [{ step: 'throwaway-add', durationMs: 459_000, endAt: SEVEN_AM }],
		expected: [addFinding({ at: SEVEN_AM_START, text: 'throwaway-add took 7 m 39 s', detail: [] })],
	},
	{
		name: 'parts that are a list -> no detail',
		adds: [{ step: 'worktree-add', durationMs: 459_000, endAt: SEVEN_AM, parts: [{ name: 'a' }] }],
		expected: [addFinding({ at: SEVEN_AM_START, text: 'worktree-add took 7 m 39 s' })],
	},
	{
		name: 'parts null -> no detail',
		adds: [{ step: 'worktree-add', durationMs: 459_000, endAt: SEVEN_AM, parts: null }],
		expected: [addFinding({ at: SEVEN_AM_START, text: 'worktree-add took 7 m 39 s' })],
	},
	{
		name: 'parts a string -> no detail',
		adds: [{ step: 'worktree-add', durationMs: 459_000, endAt: SEVEN_AM, parts: 'cloned' }],
		expected: [addFinding({ at: SEVEN_AM_START, text: 'worktree-add took 7 m 39 s' })],
	},
	{
		name: 'parts holding no nodeModules -> no detail',
		adds: [{ step: 'worktree-add', durationMs: 459_000, endAt: SEVEN_AM, parts: { npmCi: 12 } }],
		expected: [addFinding({ at: SEVEN_AM_START, text: 'worktree-add took 7 m 39 s' })],
	},
	{
		name: 'another step over the budget -> nothing',
		adds: [{ step: 'gate-fast', durationMs: 120_000, endAt: SIX_AM }],
		expected: [],
	},
	{
		name: 'a run with no start -> nothing',
		adds: [{ step: 'worktree-add', durationMs: 803_000, endAt: SIX_AM, withoutStart: true }],
		expected: [],
	},
	{
		name: 'ended before the window -> nothing',
		adds: [{ step: 'worktree-add', durationMs: 803_000, endAt: '2026-11-14T23:59:59.000Z' }],
		expected: [],
	},
	{
		name: 'ended after now -> nothing',
		adds: [{ step: 'worktree-add', durationMs: 803_000, endAt: '2026-11-15T12:00:01.000Z' }],
		expected: [],
	},
	{
		name: 'ended exactly when the window opens -> amber',
		adds: [{ step: 'worktree-add', durationMs: 803_000, endAt: '2026-11-15T00:00:00.000Z' }],
		expected: [addFinding({ at: '2026-11-14T23:46:37.000Z', text: 'worktree-add took 13 m 23 s' })],
	},
	{
		name: 'ended exactly now -> amber',
		adds: [{ step: 'worktree-add', durationMs: 803_000, endAt: '2026-11-15T12:00:00.000Z' }],
		expected: [addFinding({ at: '2026-11-15T11:46:37.000Z', text: 'worktree-add took 13 m 23 s' })],
	},
	{
		name: 'two lots, the later creation listed first -> sorted by time',
		adds: [
			{ lot: CORE_LOT, step: 'throwaway-add', durationMs: 459_000, endAt: SEVEN_AM },
			{
				lot: SCL_LOT,
				step: 'worktree-add',
				durationMs: 803_000,
				endAt: SIX_AM,
				parts: { nodeModules: 'cloned' },
			},
		],
		expected: [
			addFinding({
				lot: SCL_LOT,
				at: SIX_AM_START,
				text: 'worktree-add took 13 m 23 s',
				detail: ['node_modules cloned'],
			}),
			addFinding({ lot: CORE_LOT, at: SEVEN_AM_START, text: 'throwaway-add took 7 m 39 s' }),
		],
	},
]

describe('findSlowWorktreeAdds thresholds', () => {
	it('a creation over 60 s is slow', () => {
		expect(WORKTREE_ADD_BUDGET_MS).toBe(WORKTREE_ADD_BUDGET_SPEC_MS)
	})
})

describe('findSlowWorktreeAdds', () => {
	it.each(cases)('$name', ({ adds, expected }) => {
		const repository = addsRepositoryOf({ adds })
		expect(findSlowWorktreeAdds({ repository, window: WINDOW })).toEqual(expected)
	})
})
