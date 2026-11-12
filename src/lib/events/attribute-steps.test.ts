/** Which station a step belongs to, and the five categories of a lot's time (33L0 section 7; cases 24, 81). */
import { runsOf, stationRun, stepRun, timeOf } from '../../../test/report-events.ts'
import { attributeSteps, timeBreakdown } from './attribute-steps.ts'

import { describe, expect, it } from 'vitest'

import type { LotEvent } from './event.types.ts'

const BASE_STATIONS: LotEvent[] = [
	...stationRun({ run: 'impl', station: 'implementer', start: '10:00', end: '10:30' }),
	...stationRun({ run: 'read-a', station: 'reader', start: '10:40', end: '10:55' }),
	...stationRun({ run: 'read-b', station: 'reader-b', start: '10:45', end: '11:00' }),
	...stationRun({ run: 'review', station: 'reviewer', start: '11:10', end: '11:40' }),
]

type AttributionRow = {
	name: string
	stations?: LotEvent[]
	step: string
	at: string
	owner: string
}

const ATTRIBUTION_ROWS: AttributionRow[] = [
	{
		name: 'a gate-fast inside the implementer → implementer',
		step: 'gate-fast',
		at: '10:10',
		owner: 'implementer',
	},
	{
		name: 'a gate-fast inside two parallel readers → shared',
		step: 'gate-fast',
		at: '10:50',
		owner: 'shared',
	},
	{
		name: 'a gate-fast inside the first reader only (the second has not started) → reader',
		step: 'gate-fast',
		at: '10:41',
		owner: 'reader',
	},
	{
		name: 'a gate-fast between stations → outside stations',
		step: 'gate-fast',
		at: '11:05',
		owner: 'outside',
	},
	{
		name: 'a gate-full started while a reviewer is open → outside stations',
		step: 'gate-full',
		at: '11:20',
		owner: 'outside',
	},
	{
		name: 'a gate-fast at the very end of the implementer → implementer (the interval includes its end)',
		step: 'gate-fast',
		at: '10:30',
		owner: 'implementer',
	},
	{
		name: 'a gate-fast at the very start of the implementer → implementer (the interval includes its start)',
		step: 'gate-fast',
		at: '10:00',
		owner: 'implementer',
	},
	{
		name: 'a tdd-red inside the implementer → implementer',
		step: 'tdd-red',
		at: '10:10',
		owner: 'implementer',
	},
	{
		name: 'a tdd-green inside the implementer → implementer',
		step: 'tdd-green',
		at: '10:10',
		owner: 'implementer',
	},
	{
		name: 'a contrib inside the implementer → implementer',
		step: 'contrib',
		at: '10:10',
		owner: 'implementer',
	},
	{
		name: 'a mutation run inside the implementer → implementer',
		step: 'mutation',
		at: '10:10',
		owner: 'implementer',
	},
	{
		name: 'a gate-hook inside the implementer → outside stations (orchestration)',
		step: 'gate-hook',
		at: '10:10',
		owner: 'outside',
	},
	{
		name: 'a rehearsal inside the implementer → outside stations (orchestration)',
		step: 'rehearsal',
		at: '10:10',
		owner: 'outside',
	},
	{
		name: 'a handover-run inside the implementer → outside stations (orchestration)',
		step: 'handover-run',
		at: '10:10',
		owner: 'outside',
	},
	{
		name: 'a worktree-add inside the implementer → outside stations (orchestration)',
		step: 'worktree-add',
		at: '10:10',
		owner: 'outside',
	},
	{
		name: 'a throwaway-add inside the implementer → outside stations (orchestration)',
		step: 'throwaway-add',
		at: '10:10',
		owner: 'outside',
	},
	{
		name: 'a gate-fast inside an open station (no end) → that station, the interval lasts to now',
		stations: stationRun({ run: 'impl', station: 'implementer', start: '10:00', end: null }),
		step: 'gate-fast',
		at: '11:30',
		owner: 'implementer',
	},
	{
		name: 'a gate-fast inside the interval [end - duration, end] of an end-only station → that station',
		stations: stationRun({
			run: 'impl',
			station: 'implementer',
			start: null,
			end: '10:30',
			endFields: { duration: 1200 },
		}),
		step: 'gate-fast',
		at: '10:15',
		owner: 'implementer',
	},
	{
		name: 'a gate-fast before the interval of an end-only station → outside stations',
		stations: stationRun({
			run: 'impl',
			station: 'implementer',
			start: null,
			end: '10:30',
			endFields: { duration: 1200 },
		}),
		step: 'gate-fast',
		at: '10:05',
		owner: 'outside',
	},
	{
		name: 'a gate-fast inside the day of an end-only station with no duration → outside stations (no interval)',
		stations: stationRun({ run: 'impl', station: 'implementer', start: null, end: '10:30' }),
		step: 'gate-fast',
		at: '10:25',
		owner: 'outside',
	},
]

describe('attributeSteps: the station of a step, by time (case 81)', () => {
	for (const row of ATTRIBUTION_ROWS)
		it(row.name, () => {
			const events = [
				...(row.stations ?? BASE_STATIONS),
				...stepRun({ run: 'step-1', step: row.step, start: row.at, end: '11:50' }),
			]

			expect(
				attributeSteps({
					stationRuns: runsOf({ events, kindPrefix: 'station' }),
					stepRuns: runsOf({ events, kindPrefix: 'step' }),
					now: timeOf('12:00'),
				}),
			).toEqual([{ run: 'step-1', step: row.step, owner: row.owner }])
		})
})

/** Station runs, step runs, one question, one wait: 10:00 to 11:00 laid out so each category has its own part. */
const OVERLAP_EVENTS: LotEvent[] = [
	...stationRun({ run: 'a', station: 'implementer', start: '10:00', end: '10:30' }),
	...stationRun({ run: 'b', station: 'reviewer', start: '10:10', end: '10:40' }),
	...stepRun({ run: 's1', step: 'gate-full', start: '10:35', end: '10:50' }),
	// an end-only run with no duration: outside the union, outside the agent time
	...stationRun({ run: 'c', station: 'reviewer', start: null, end: '10:59' }),
]
const QUESTIONS = [{ asked: timeOf('10:45'), answered: timeOf('10:55') }]
const WAITS = [{ at: timeOf('10:57'), waitedMs: 120_000 }]

describe('timeBreakdown: five categories (case 24)', () => {
	it('overlapping stations, a step, a question, a wait → the five add up to the elapsed time; agent time apart and larger', () => {
		// agents 10:00-10:40 (union), cli steps 10:40-10:50, waiting 10:50-10:55, machine 10:55-10:57, the rest other
		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: runsOf({ events: OVERLAP_EVENTS, kindPrefix: 'station' }),
				stepRuns: runsOf({ events: OVERLAP_EVENTS, kindPrefix: 'step' }),
				questions: QUESTIONS,
				waits: WAITS,
			}),
		).toEqual({
			elapsed: 3600,
			agents: 2400,
			cliSteps: 600,
			waiting: 300,
			machine: 120,
			other: 180,
			agentTime: { known: 3600, unknownRuns: 1 },
		})
	})

	it('a step.wait lying inside an agent interval → counted once, as agents (the order of the categories)', () => {
		const events = stationRun({ run: 'a', station: 'implementer', start: '10:00', end: '10:30' })

		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: runsOf({ events, kindPrefix: 'station' }),
				stepRuns: [],
				questions: [],
				waits: [{ at: timeOf('10:20'), waitedMs: 600_000 }],
			}),
		).toMatchObject({ agents: 1800, machine: 0, other: 1800 })
	})

	it('no step.wait event → waiting for the machine is 0', () => {
		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: [],
				stepRuns: [],
				questions: [],
				waits: [],
			}),
		).toEqual({
			elapsed: 3600,
			agents: 0,
			cliSteps: 0,
			waiting: 0,
			machine: 0,
			other: 3600,
			agentTime: { known: 0, unknownRuns: 0 },
		})
	})

	it('an end-only station run with a duration → its interval [end - duration, end] enters the union and the agent time', () => {
		const events = stationRun({
			run: 'a',
			station: 'implementer',
			start: null,
			end: '10:30',
			endFields: { duration: 600 },
		})

		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: runsOf({ events, kindPrefix: 'station' }),
				stepRuns: [],
				questions: [],
				waits: [],
			}),
		).toMatchObject({ agents: 600, agentTime: { known: 600, unknownRuns: 0 }, other: 3000 })
	})

	it('two end-only station runs with no duration → no run time is known: the agent time is null, not 0', () => {
		const events = [
			...stationRun({ run: 'a', station: 'implementer', start: null, end: '10:30' }),
			...stationRun({ run: 'b', station: 'reviewer', start: null, end: '10:40' }),
		]

		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: runsOf({ events, kindPrefix: 'station' }),
				stepRuns: [],
				questions: [],
				waits: [],
			}),
		).toMatchObject({ agents: 0, agentTime: null })
	})

	it('one end-only run with a duration and one without → the known seconds and the count of runs with no time', () => {
		const events = [
			...stationRun({
				run: 'a',
				station: 'implementer',
				start: null,
				end: '10:30',
				endFields: { duration: 600 },
			}),
			...stationRun({ run: 'b', station: 'reviewer', start: null, end: '10:40' }),
		]

		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: runsOf({ events, kindPrefix: 'station' }),
				stepRuns: [],
				questions: [],
				waits: [],
			}),
		).toMatchObject({ agentTime: { known: 600, unknownRuns: 1 } })
	})

	it('an open station run and an open question → both last to now', () => {
		const events: LotEvent[] = [
			...stationRun({ run: 'a', station: 'implementer', start: '10:00', end: '10:20' }),
			...stationRun({ run: 'b', station: 'reviewer', start: '10:30', end: null }),
		]

		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('10:50'),
				now: timeOf('10:50'),
				stationRuns: runsOf({ events, kindPrefix: 'station' }),
				stepRuns: [],
				questions: [{ asked: timeOf('10:20'), answered: null }],
				waits: [],
			}),
		).toEqual({
			elapsed: 3000,
			agents: 2 * 600 + 20 * 60,
			cliSteps: 0,
			waiting: 600,
			machine: 0,
			other: 0,
			agentTime: { known: 2 * 600 + 20 * 60, unknownRuns: 0 },
		})
	})

	it('a question overlapping a wait → the overlap is waiting for answers (answers come before the machine)', () => {
		// question 10:10-10:20; wait [10:15, 10:25]: waiting 600, machine only 10:20-10:25
		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: [],
				stepRuns: [],
				questions: [{ asked: timeOf('10:10'), answered: timeOf('10:20') }],
				waits: [{ at: timeOf('10:25'), waitedMs: 600_000 }],
			}),
		).toMatchObject({ waiting: 600, machine: 300, other: 2700 })
	})

	it('a step overlapping a wait → the overlap is cli steps (cli steps come before the machine)', () => {
		const events = stepRun({ run: 's1', step: 'gate-full', start: '10:00', end: '10:20' })

		// step 10:00-10:20; wait [10:10, 10:30]: cli steps 1200, machine only 10:20-10:30
		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: [],
				stepRuns: runsOf({ events, kindPrefix: 'step' }),
				questions: [],
				waits: [{ at: timeOf('10:30'), waitedMs: 1_200_000 }],
			}),
		).toMatchObject({ cliSteps: 1200, machine: 600, other: 1800 })
	})

	it('a station starting before the lot began → clipped to [from, to] in the breakdown, the agent time unclipped', () => {
		const events = stationRun({ run: 'a', station: 'implementer', start: '09:30', end: '10:30' })

		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: runsOf({ events, kindPrefix: 'station' }),
				stepRuns: [],
				questions: [],
				waits: [],
			}),
		).toMatchObject({
			elapsed: 3600,
			agents: 1800,
			other: 1800,
			agentTime: { known: 3600, unknownRuns: 0 },
		})
	})

	it('a station started and never ended on a terminal lot (to before now) → its interval stops at to, not at now', () => {
		const events = stationRun({ run: 'a', station: 'implementer', start: '10:30', end: null })

		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: runsOf({ events, kindPrefix: 'station' }),
				stepRuns: [],
				questions: [],
				waits: [],
			}),
		).toMatchObject({ elapsed: 3600, agents: 1800, other: 1800 })
	})

	it('a step started and never ended on a terminal lot (to before now) → its interval stops at to, not at now', () => {
		const events = stepRun({ run: 's1', step: 'gate-fast', start: '10:30', end: null })

		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: [],
				stepRuns: runsOf({ events, kindPrefix: 'step' }),
				questions: [],
				waits: [],
			}),
		).toMatchObject({ elapsed: 3600, cliSteps: 1800, other: 1800 })
	})

	it('a wait ending after the lot ended → clipped to to', () => {
		expect(
			timeBreakdown({
				from: timeOf('10:00'),
				to: timeOf('11:00'),
				now: timeOf('12:00'),
				stationRuns: [],
				stepRuns: [],
				questions: [],
				waits: [{ at: timeOf('11:10'), waitedMs: 1_200_000 }],
			}),
		).toMatchObject({ machine: 600, other: 3000 })
	})
})
