import {
	FOUR_HOURS_MS,
	ONE_HOUR_MS,
	OTHER_STALL_LOT,
	OTHER_WORKTREE,
	RESUME_CASES,
	STALL_FIRST_PID,
	STALL_PID,
	THREE_HOURS_MS,
	TWO_HOURS_MS,
	TWO_AND_A_HALF_HOURS_MS,
	HEAVY_STEP_STALL_SPEC_MS,
	STATION_STALL_SPEC_MS,
	STEP_STALL_SPEC_MS,
	DETAIL,
	GATE_FULL_NEXT,
	HANDOVER_NEXT,
	NOW,
} from '../../../test/health-stall.constants.ts'
import {
	GONE_TEXT,
	gone,
	openRun,
	stallFinding,
	scopeChangedOf,
	stallRepositoryOf,
	stepEndOf,
	stepStartOf,
} from '../../../test/health-stall.ts'
import { HEAVY_STEP_STALL_MS, STATION_STALL_MS, STEP_STALL_MS } from './health.constants.ts'
import { findStalledRuns } from './rule-stalled-runs.ts'

import { describe, expect, it } from 'vitest'

import type { StallCase } from '../../../test/health-stall.types.ts'

const GATE_FULL_START_AT = gone(THREE_HOURS_MS)
const SOON_AT = gone(ONE_HOUR_MS)

const deadCases: StallCase[] = [
	{
		name: 'open lot, last step.start gate-full, pid gone -> red, resume with gate --full',
		lots: [{ events: openRun({ step: 'gate-full', at: GATE_FULL_START_AT }) }],
		expected: [
			stallFinding({
				severity: 'red',
				at: GATE_FULL_START_AT,
				text: GONE_TEXT({ step: 'gate-full', at: GATE_FULL_START_AT }),
				detail: DETAIL,
				next: GATE_FULL_NEXT,
			}),
		],
	},
	{
		name: 'open lot, last step.start handover-run, pid gone -> red, resume with handover run <folder>',
		lots: [{ events: openRun({ step: 'handover-run', at: GATE_FULL_START_AT }) }],
		expected: [
			stallFinding({
				severity: 'red',
				at: GATE_FULL_START_AT,
				text: GONE_TEXT({ step: 'handover-run', at: GATE_FULL_START_AT }),
				detail: DETAIL,
				next: HANDOVER_NEXT,
			}),
		],
	},
	{
		name: 'a scope.changed event after the open start -> still red (the kind is ignored)',
		lots: [
			{
				events: [
					...openRun({ step: 'gate-full', at: GATE_FULL_START_AT }),
					scopeChangedOf({ at: SOON_AT }),
				],
			},
		],
		expected: [
			stallFinding({
				severity: 'red',
				at: GATE_FULL_START_AT,
				text: GONE_TEXT({ step: 'gate-full', at: GATE_FULL_START_AT }),
				detail: DETAIL,
				next: GATE_FULL_NEXT,
			}),
		],
	},
	{
		name: 'a damaged lot with an open dead start -> red',
		lots: [
			{
				state: 'damaged',
				events: openRun({ step: 'gate-full', at: GATE_FULL_START_AT }),
			},
		],
		expected: [
			stallFinding({
				severity: 'red',
				at: GATE_FULL_START_AT,
				text: GONE_TEXT({ step: 'gate-full', at: GATE_FULL_START_AT }),
				detail: DETAIL,
				next: GATE_FULL_NEXT,
			}),
		],
	},
	{
		name: 'a committed lot with an open dead start -> nothing',
		lots: [
			{
				state: 'committed',
				events: openRun({ step: 'gate-full', at: GATE_FULL_START_AT }),
			},
		],
		expected: [],
	},
	{
		name: 'a canceled lot with an open dead start -> nothing',
		lots: [
			{
				state: 'canceled',
				events: openRun({ step: 'gate-full', at: GATE_FULL_START_AT }),
			},
		],
		expected: [],
	},
	{
		name: 'a lot with no state with an open dead start -> nothing',
		lots: [
			{
				state: undefined,
				events: openRun({ step: 'gate-full', at: GATE_FULL_START_AT }),
			},
		],
		expected: [],
	},
	{
		name: 'an open run inside a lot that moved on (a later run started and ended) -> nothing',
		lots: [
			{
				events: [
					...openRun({ step: 'rehearsal', at: GATE_FULL_START_AT }),
					stepStartOf({
						run: 'run-later',
						step: 'handover-run',
						at: gone(TWO_HOURS_MS),
					}),
					stepEndOf({
						run: 'run-later',
						step: 'handover-run',
						at: gone(ONE_HOUR_MS),
						durationMs: ONE_HOUR_MS,
					}),
				],
			},
		],
		expected: [],
	},
	{
		name: 'a lot with no event -> nothing',
		lots: [{ events: [] }],
		expected: [],
	},
	{
		name: 'two lots, listed newest first -> findings sorted by time, oldest first',
		lots: [
			{ events: openRun({ step: 'gate-full', at: SOON_AT }) },
			{
				name: OTHER_STALL_LOT,
				events: [
					stepStartOf({
						run: 'run-other',
						step: 'contrib',
						at: GATE_FULL_START_AT,
						worktree: OTHER_WORKTREE,
					}),
				],
			},
		],
		expected: [
			stallFinding({
				severity: 'red',
				lot: OTHER_STALL_LOT,
				at: GATE_FULL_START_AT,
				text: GONE_TEXT({ step: 'contrib', at: GATE_FULL_START_AT }),
				detail: [`worktree ${OTHER_WORKTREE}`],
				next: `cd ${OTHER_WORKTREE} && dialecte contrib`,
			}),
			stallFinding({
				severity: 'red',
				at: SOON_AT,
				text: GONE_TEXT({ step: 'gate-full', at: SOON_AT }),
				detail: DETAIL,
				next: GATE_FULL_NEXT,
			}),
		],
	},
]

describe('findStalledRuns', () => {
	it.each(deadCases)('$name', function stalledRunCase(row) {
		const repository = stallRepositoryOf({ lots: row.lots })
		expect(
			findStalledRuns({
				repository,
				now: row.now ?? NOW,
				isAlive: () => row.alive === true,
			}),
		).toEqual(row.expected)
	})

	it.each(RESUME_CASES)('a dead $step start gives $next', function resumeCase({ step, next }) {
		const at = gone(THREE_HOURS_MS)
		const repository = stallRepositoryOf({
			lots: [{ events: openRun({ step, at }) }],
		})
		expect(findStalledRuns({ repository, now: NOW, isAlive: () => false })).toEqual([
			stallFinding({
				severity: 'red',
				at,
				text: GONE_TEXT({ step, at }),
				detail: DETAIL,
				next,
			}),
		])
	})

	it('asks isAlive for the pid of the open start', function asksForThePid() {
		const asked: number[] = []
		const repository = stallRepositoryOf({
			lots: [
				{
					events: [
						stepStartOf({
							run: 'run-first',
							step: 'gate-fast',
							at: gone(FOUR_HOURS_MS),
							pid: STALL_FIRST_PID,
						}),
						stepEndOf({
							run: 'run-first',
							step: 'gate-fast',
							at: gone(THREE_HOURS_MS),
							durationMs: ONE_HOUR_MS,
							pid: STALL_FIRST_PID,
						}),
						stepStartOf({
							run: 'run-open',
							step: 'gate-full',
							at: gone(TWO_AND_A_HALF_HOURS_MS),
						}),
					],
				},
			],
		})
		expect(
			findStalledRuns({
				repository,
				now: NOW,
				isAlive(pid) {
					asked.push(pid)
					return true
				},
			}),
		).toHaveLength(1)
		expect(asked).toEqual([STALL_PID])
	})

	it('pins the three thresholds of the spec', function pinsThresholds() {
		expect([STEP_STALL_MS, HEAVY_STEP_STALL_MS, STATION_STALL_MS]).toEqual([
			STEP_STALL_SPEC_MS,
			HEAVY_STEP_STALL_SPEC_MS,
			STATION_STALL_SPEC_MS,
		])
	})
})
