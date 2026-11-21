import { stallRepositoryOf } from '../../../test/health-stall.ts'
import {
	DAY_MS,
	HOUR_MS,
	WORKTREE_IDLE_SPEC_MS,
	WORKTREES_NOW,
} from '../../../test/health-worktrees.constants.ts'
import {
	idleFinding,
	idleWorktreesOf,
	worktreePathOf,
	worktreesRepositoryOf,
} from '../../../test/health-worktrees.ts'
import { WORKTREE_IDLE_MS } from './health.constants.ts'
import { findIdleWorktrees } from './rule-worktrees.ts'

import { describe, expect, it } from 'vitest'

import type { IdleCase } from '../../../test/health-worktrees.types.ts'

const COMMITTED = { state: 'committed' }
const CLOSED = { state: 'committed', closed: '2026-11-13T10:00:00.000Z' }

const countCases: IdleCase[] = [
	{
		name: '3 idle worktrees (48, 49, 50 h) -> amber, count 3, the oldest named',
		worktrees: idleWorktreesOf(3),
		expected: [
			idleFinding({ text: '3 idle worktrees with no open lot (oldest 0003-cli-w, idle 50 h 0 m)' }),
		],
	},
	{
		name: '41 idle worktrees -> amber',
		worktrees: idleWorktreesOf(41),
		expected: [
			idleFinding({
				text: '41 idle worktrees with no open lot (oldest 0041-cli-w, idle 88 h 0 m)',
			}),
		],
	},
	{
		name: '40 idle worktrees -> amber',
		worktrees: idleWorktreesOf(40),
		expected: [
			idleFinding({
				text: '40 idle worktrees with no open lot (oldest 0040-cli-w, idle 87 h 0 m)',
			}),
		],
	},
	{
		name: 'oldest by activity, not by creation -> the least recently touched is named',
		worktrees: [
			{ name: '0001-cli-a', idleMs: 3 * DAY_MS, createdMs: 4 * DAY_MS },
			{ name: '0002-cli-b', idleMs: 2 * DAY_MS, createdMs: 30 * DAY_MS },
		],
		expected: [
			idleFinding({ text: '2 idle worktrees with no open lot (oldest 0001-cli-a, idle 72 h 0 m)' }),
		],
	},
	{
		name: 'no worktree -> no finding',
		worktrees: [],
		expected: [],
	},
	{
		name: 'only worktrees touched an hour ago -> no finding',
		worktrees: [{ name: '0001-cli-a', idleMs: HOUR_MS }],
		expected: [],
	},
]

const boundaryCases: IdleCase[] = [
	{
		name: 'idle exactly 24 h -> not idle',
		worktrees: [{ name: '0001-cli-a', idleMs: WORKTREE_IDLE_SPEC_MS }],
		expected: [],
	},
	{
		name: 'idle 24 h + 1 ms -> idle',
		worktrees: [{ name: '0001-cli-a', idleMs: WORKTREE_IDLE_SPEC_MS + 1 }],
		expected: [
			idleFinding({ text: '1 idle worktree with no open lot (oldest 0001-cli-a, idle 24 h 0 m)' }),
		],
	},
]

const heldCases: IdleCase[] = [
	{
		name: 'held by a working lot, idle 5 d -> not counted',
		worktrees: [{ name: '0001-cli-a', idleMs: 5 * DAY_MS }],
		lots: [{ state: 'working', worktree: worktreePathOf('0001-cli-a') }],
		expected: [],
	},
	{
		name: 'held by a committed lot -> counted',
		worktrees: [{ name: '0001-cli-a', idleMs: 5 * DAY_MS }],
		lots: [{ state: 'committed', worktree: worktreePathOf('0001-cli-a') }],
		expected: [
			idleFinding({
				text: '1 idle worktree with no open lot (oldest 0001-cli-a, idle 120 h 0 m)',
			}),
		],
	},
	{
		name: 'held by a canceled lot -> counted',
		worktrees: [{ name: '0001-cli-a', idleMs: 2 * DAY_MS }],
		lots: [{ state: 'canceled', worktree: worktreePathOf('0001-cli-a') }],
		expected: [
			idleFinding({ text: '1 idle worktree with no open lot (oldest 0001-cli-a, idle 48 h 0 m)' }),
		],
	},
	{
		name: 'held by a damaged lot -> not counted',
		worktrees: [{ name: '0001-cli-a', idleMs: 5 * DAY_MS }],
		lots: [{ state: 'damaged', worktree: worktreePathOf('0001-cli-a') }],
		expected: [],
	},
	{
		name: 'named by a lot with no state -> counted',
		worktrees: [{ name: '0001-cli-a', idleMs: 2 * DAY_MS }],
		lots: [{ state: undefined, worktree: worktreePathOf('0001-cli-a') }],
		expected: [
			idleFinding({ text: '1 idle worktree with no open lot (oldest 0001-cli-a, idle 48 h 0 m)' }),
		],
	},
	{
		name: 'an open lot holds the older of two worktrees -> only the other is counted, the oldest among idle',
		worktrees: [
			{ name: '0001-cli-a', idleMs: 2 * DAY_MS },
			{ name: '0002-cli-b', idleMs: 5 * DAY_MS },
		],
		lots: [{ state: 'working', worktree: worktreePathOf('0002-cli-b') }],
		expected: [
			idleFinding({ text: '1 idle worktree with no open lot (oldest 0001-cli-a, idle 48 h 0 m)' }),
		],
	},
]

const COMMITTED_LINE = 'committed, not closed: 0023-cli-rule-gaps-rg - dialecte lot close 0023'
const NOT_CLOSED_TEXT =
	'1 idle worktree with no open lot (oldest 0023-cli-rule-gaps-rg, idle 72 h 0 m)'

const committedCases: IdleCase[] = [
	{
		name: 'idle, committed, not closed -> its line names dialecte lot close 0023',
		worktrees: [{ name: '0023-cli-rule-gaps-rg', idleMs: 3 * DAY_MS, handover: COMMITTED }],
		expected: [idleFinding({ text: NOT_CLOSED_TEXT, detail: [COMMITTED_LINE] })],
	},
	{
		name: 'idle, committed and closed -> no line',
		worktrees: [{ name: '0023-cli-rule-gaps-rg', idleMs: 3 * DAY_MS, handover: CLOSED }],
		expected: [idleFinding({ text: NOT_CLOSED_TEXT })],
	},
	{
		name: 'idle, hand-over pending -> no line',
		worktrees: [
			{ name: '0023-cli-rule-gaps-rg', idleMs: 3 * DAY_MS, handover: { state: 'pending' } },
		],
		expected: [idleFinding({ text: NOT_CLOSED_TEXT })],
	},
	{
		name: 'committed, not closed, touched an hour ago, beside an idle one -> no line',
		worktrees: [
			{ name: '0023-cli-rule-gaps-rg', idleMs: HOUR_MS, handover: COMMITTED },
			{ name: '0001-cli-a', idleMs: 2 * DAY_MS },
		],
		expected: [
			idleFinding({ text: '1 idle worktree with no open lot (oldest 0001-cli-a, idle 48 h 0 m)' }),
		],
	},
	{
		name: 'committed, not closed, held by a working lot, beside an idle one -> no line',
		worktrees: [
			{ name: '0023-cli-rule-gaps-rg', idleMs: 3 * DAY_MS, handover: COMMITTED },
			{ name: '0001-cli-a', idleMs: 2 * DAY_MS },
		],
		lots: [{ state: 'working', worktree: worktreePathOf('0023-cli-rule-gaps-rg') }],
		expected: [
			idleFinding({ text: '1 idle worktree with no open lot (oldest 0001-cli-a, idle 48 h 0 m)' }),
		],
	},
	{
		name: 'committed, not closed, a name with no index -> the short line',
		worktrees: [{ name: 'cli-worktree-index', idleMs: 9 * DAY_MS, handover: COMMITTED }],
		expected: [
			idleFinding({
				text: '1 idle worktree with no open lot (oldest cli-worktree-index, idle 216 h 0 m)',
				detail: ['committed, not closed: cli-worktree-index'],
			}),
		],
	},
	{
		name: 'two committed, not closed -> their lines sorted by name',
		worktrees: [
			{ name: '0036-cli-b', idleMs: 4 * DAY_MS, handover: COMMITTED },
			{ name: '0025-cli-a', idleMs: 3 * DAY_MS, handover: COMMITTED },
		],
		expected: [
			idleFinding({
				text: '2 idle worktrees with no open lot (oldest 0036-cli-b, idle 96 h 0 m)',
				detail: [
					'committed, not closed: 0025-cli-a - dialecte lot close 0025',
					'committed, not closed: 0036-cli-b - dialecte lot close 0036',
				],
			}),
		],
	},
]

const GONE_LINE = '2 registered worktrees whose folder is gone'

const goneCases: IdleCase[] = [
	{
		name: 'only gone worktrees -> amber no idle worktree, with the gone line',
		worktrees: [
			{ name: '0001-cli-a', idleMs: 5 * DAY_MS, gone: true },
			{ name: '0002-cli-b', idleMs: 5 * DAY_MS, gone: true },
		],
		expected: [idleFinding({ text: 'no idle worktree', detail: [GONE_LINE] })],
	},
	{
		name: 'gone and idle worktrees -> the idle text and the gone line',
		worktrees: [
			{ name: '0001-cli-a', idleMs: 5 * DAY_MS, gone: true },
			{ name: '0002-cli-b', idleMs: 5 * DAY_MS, gone: true },
			{ name: '0003-cli-c', idleMs: 2 * DAY_MS },
		],
		expected: [
			idleFinding({
				text: '1 idle worktree with no open lot (oldest 0003-cli-c, idle 48 h 0 m)',
				detail: [GONE_LINE],
			}),
		],
	},
	{
		name: 'a gone worktree with a committed hand-over -> no committed line',
		worktrees: [
			{ name: '0001-cli-a', idleMs: 5 * DAY_MS, gone: true, handover: COMMITTED },
			{ name: '0002-cli-b', idleMs: 5 * DAY_MS, gone: true },
		],
		expected: [idleFinding({ text: 'no idle worktree', detail: [GONE_LINE] })],
	},
]

const tables: Array<{ title: string; cases: IdleCase[] }> = [
	{ title: 'counting idle worktrees', cases: countCases },
	{ title: 'the idle boundary', cases: boundaryCases },
	{ title: 'worktrees an open lot holds', cases: heldCases },
	{ title: 'committed hand-overs not closed', cases: committedCases },
	{ title: 'worktrees whose folder is gone', cases: goneCases },
]

describe('findIdleWorktrees thresholds', () => {
	it('an idle worktree is one untouched for 24 h', () => {
		expect(WORKTREE_IDLE_MS).toBe(WORKTREE_IDLE_SPEC_MS)
	})
})

describe('findIdleWorktrees on a repository built with no worktrees field', () => {
	it('no worktrees field -> no finding', () => {
		const repository = stallRepositoryOf({ lots: [] })
		expect(findIdleWorktrees({ repository, now: WORKTREES_NOW })).toEqual([])
	})
})

describe.each(tables)('findIdleWorktrees: $title', ({ cases }) => {
	it.each(cases)('$name', ({ worktrees, lots, expected }) => {
		const repository = worktreesRepositoryOf({ worktrees, lots })
		expect(findIdleWorktrees({ repository, now: WORKTREES_NOW })).toEqual(expected)
	})
})

/** The repository of a case whose lots are each kept on purpose (`HealthLot.kept`). */
function keptRepositoryOf(params: Pick<IdleCase, 'worktrees' | 'lots'>) {
	const repository = worktreesRepositoryOf(params)
	return { ...repository, lots: repository.lots.map((lot) => ({ ...lot, kept: true as const })) }
}

const keptCases: IdleCase[] = [
	{
		name: 'its own worktree held by a committed lot kept on purpose, idle 5 d -> not counted',
		worktrees: [{ name: '0001-cli-a', idleMs: 5 * DAY_MS }],
		lots: [{ state: 'committed', worktree: worktreePathOf('0001-cli-a') }],
		expected: [],
	},
	{
		name: 'its own worktree held by a canceled lot kept on purpose, idle 2 d -> not counted',
		worktrees: [{ name: '0001-cli-a', idleMs: 2 * DAY_MS }],
		lots: [{ state: 'canceled', worktree: worktreePathOf('0001-cli-a') }],
		expected: [],
	},
	{
		name: 'a kept committed lot holds the older of two idle worktrees -> only the other is counted',
		worktrees: [
			{ name: '0001-cli-a', idleMs: 2 * DAY_MS },
			{ name: '0002-cli-b', idleMs: 5 * DAY_MS },
		],
		lots: [{ state: 'committed', worktree: worktreePathOf('0002-cli-b') }],
		expected: [
			idleFinding({ text: '1 idle worktree with no open lot (oldest 0001-cli-a, idle 48 h 0 m)' }),
		],
	},
]

describe('findIdleWorktrees: a lot kept on purpose holds its own worktree', () => {
	it.each(keptCases)('$name', ({ worktrees, lots, expected }) => {
		expect(
			findIdleWorktrees({ repository: keptRepositoryOf({ worktrees, lots }), now: WORKTREES_NOW }),
		).toEqual(expected)
	})
})
