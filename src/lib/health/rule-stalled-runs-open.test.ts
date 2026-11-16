import {
	FOUR_HOURS_MS,
	INTERRUPTED_AT,
	INTERRUPTED_FOR,
	INTERRUPTED_MS,
	ONE_HOUR_MS,
	ONE_MS,
	STALL_PID,
	THREE_HOURS_MS,
	TWO_AND_A_HALF_HOURS_MS,
	TWO_HOURS_MS,
	DETAIL,
	GATE_FULL_NEXT,
	HANDOVER_NEXT,
	NOW,
} from '../../../test/health-stall.constants.ts'
import {
	gone,
	openRun,
	stallFinding,
	stallRepositoryOf,
	stationEventOf,
	stepEndOf,
	stepStartOf,
} from '../../../test/health-stall.ts'
import { findStalledRuns } from './rule-stalled-runs.ts'

import { describe, expect, it } from 'vitest'

import type { StallCase } from '../../../test/health-stall.types.ts'

const SOON_AT = gone(ONE_HOUR_MS)

function runOf(params: { run: string; step: string; startMs: number; endMs: number }) {
	return [
		stepStartOf({ run: params.run, step: params.step, at: gone(params.startMs) }),
		stepEndOf({
			run: params.run,
			step: params.step,
			at: gone(params.endMs),
			durationMs: params.startMs - params.endMs,
		}),
	]
}

function aliveCase(params: {
	name: string
	step?: string
	heavy?: boolean
	ageMs: number
	expected: StallCase['expected']
}): StallCase {
	const at = gone(params.ageMs)
	return {
		name: params.name,
		alive: true,
		lots: [
			{
				events: openRun({
					step: params.step ?? 'gate-full',
					at,
					heavy: params.heavy,
				}),
			},
		],
		expected: params.expected,
	}
}

function aliveFinding(params: { step?: string; at: string; ageText: string }) {
	const step = params.step ?? 'gate-full'
	return stallFinding({
		severity: 'amber',
		at: params.at,
		text: `${step} running ${params.ageText}: pid ${STALL_PID} alive since ${params.at}`,
		detail: DETAIL,
		next: GATE_FULL_NEXT,
	})
}

const interruptedEnd = stepEndOf({
	run: 'run-int',
	step: 'handover-run',
	at: INTERRUPTED_AT,
	durationMs: INTERRUPTED_MS,
	outcome: 'interrupted',
	exit: 1,
})
const interruptedStart = stepStartOf({
	run: 'run-int',
	step: 'handover-run',
	at: new Date(Date.parse(INTERRUPTED_AT) - INTERRUPTED_MS - 5_000).toISOString(),
})

const interruptedCases: StallCase[] = [
	{
		name: 'last event a step.end interrupted (handover-run 2416028 ms) -> amber with the resume command',
		alive: true,
		lots: [{ events: [interruptedStart, interruptedEnd] }],
		expected: [
			stallFinding({
				severity: 'amber',
				at: INTERRUPTED_AT,
				text: `handover-run interrupted at ${INTERRUPTED_AT} after ${INTERRUPTED_FOR}`,
				detail: DETAIL,
				next: HANDOVER_NEXT,
			}),
		],
	},
	{
		name: 'interrupted, then a later green run of the same step -> nothing',
		lots: [
			{
				events: [
					interruptedStart,
					interruptedEnd,
					stepStartOf({
						run: 'run-green',
						step: 'handover-run',
						at: gone(TWO_HOURS_MS),
					}),
					stepEndOf({
						run: 'run-green',
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
		name: 'interrupted, then a later passed run of a different step -> nothing',
		lots: [
			{
				events: [
					interruptedStart,
					interruptedEnd,
					...runOf({
						run: 'run-other',
						step: 'gate-full',
						startMs: TWO_HOURS_MS,
						endMs: ONE_HOUR_MS,
					}),
				],
			},
		],
		expected: [],
	},
	{
		name: 'last event a step.end that ended on its own -> nothing',
		lots: [
			{
				events: [
					stepStartOf({
						run: 'run-ok',
						step: 'gate-full',
						at: gone(TWO_HOURS_MS),
					}),
					stepEndOf({
						run: 'run-ok',
						step: 'gate-full',
						at: SOON_AT,
						durationMs: ONE_HOUR_MS,
					}),
				],
			},
		],
		expected: [],
	},
]

const aliveCases: StallCase[] = [
	aliveCase({
		name: 'pid alive, non-heavy, 2 h + 1 ms -> amber with the pid and the age',
		ageMs: TWO_HOURS_MS + ONE_MS,
		expected: [aliveFinding({ at: gone(TWO_HOURS_MS + ONE_MS), ageText: '2 h 0 m' })],
	}),
	aliveCase({
		name: 'pid alive, non-heavy, exactly 2 h -> nothing',
		ageMs: TWO_HOURS_MS,
		expected: [],
	}),
	aliveCase({
		name: 'pid alive, heavy, 2.5 h -> nothing',
		heavy: true,
		ageMs: TWO_AND_A_HALF_HOURS_MS,
		expected: [],
	}),
	aliveCase({
		name: 'pid alive, heavy, 3 h + 1 ms -> amber',
		heavy: true,
		ageMs: THREE_HOURS_MS + ONE_MS,
		expected: [aliveFinding({ at: gone(THREE_HOURS_MS + ONE_MS), ageText: '3 h 0 m' })],
	}),
	aliveCase({
		name: 'pid alive, heavy, exactly 3 h -> nothing',
		heavy: true,
		ageMs: THREE_HOURS_MS,
		expected: [],
	}),
	aliveCase({
		name: 'pid alive, started 1 h ago -> nothing',
		ageMs: ONE_HOUR_MS,
		expected: [],
	}),
]

const stationOpenAt = gone(FOUR_HOURS_MS + ONE_MS)
function stationOf(at: string) {
	return stationEventOf({
		kind: 'station.start',
		run: 'st-1',
		station: 'test-writer',
		at,
	})
}
const stationCases: StallCase[] = [
	{
		name: 'station.start with no end at 4 h + 1 ms -> amber, no detail, no next',
		alive: true,
		lots: [{ events: [stationOf(stationOpenAt)] }],
		expected: [
			stallFinding({
				severity: 'amber',
				at: stationOpenAt,
				text: `station test-writer open 4 h 0 m since ${stationOpenAt}`,
			}),
		],
	},
	{
		name: 'station.start with no end at 1 h -> nothing',
		lots: [{ events: [stationOf(SOON_AT)] }],
		expected: [],
	},
	{
		name: 'station.start open exactly 4 h -> nothing',
		lots: [{ events: [stationOf(gone(FOUR_HOURS_MS))] }],
		expected: [],
	},
	{
		name: 'an open dead gate-full start 3 h ago, then a station.end 1 h ago -> nothing (the last run event is the end)',
		lots: [
			{
				events: [
					...openRun({ step: 'gate-full', at: gone(THREE_HOURS_MS) }),
					stationEventOf({ kind: 'station.end', run: 'st-2', station: 'test-writer', at: SOON_AT }),
				],
			},
		],
		expected: [],
	},
	{
		name: 'a station.start 4 h + 1 ms ago, then a passed step run -> nothing',
		lots: [
			{
				events: [
					stationOf(stationOpenAt),
					...runOf({
						run: 'run-pass',
						step: 'gate-full',
						startMs: TWO_HOURS_MS,
						endMs: ONE_HOUR_MS,
					}),
				],
			},
		],
		expected: [],
	},
	{
		name: 'station.start with its station.end -> nothing',
		lots: [
			{
				events: [
					stationOf(stationOpenAt),
					stationEventOf({
						kind: 'station.end',
						run: 'st-1',
						station: 'test-writer',
						at: SOON_AT,
					}),
				],
			},
		],
		expected: [],
	},
]

describe('findStalledRuns, interrupted steps, live processes and stations', () => {
	it.each([...interruptedCases, ...aliveCases, ...stationCases])(
		'$name',
		function openRunCase(row) {
			const repository = stallRepositoryOf({ lots: row.lots })
			expect(
				findStalledRuns({ repository, now: row.now ?? NOW, isAlive: () => row.alive === true }),
			).toEqual(row.expected)
		},
	)
})

describe('findStalledRuns, the process of an interrupted end', () => {
	it('never asks isAlive about an interrupted end', function neverAsksIsAlive() {
		const asked: number[] = []
		expect(
			findStalledRuns({
				repository: stallRepositoryOf({ lots: [{ events: [interruptedStart, interruptedEnd] }] }),
				now: NOW,
				isAlive(pid) {
					asked.push(pid)
					return true
				},
			}),
		).toHaveLength(1)
		expect(asked).toEqual([])
	})
})
