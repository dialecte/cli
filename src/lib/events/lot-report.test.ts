/**
 * The report model of one lot from plain inputs (33L0 section 7; cases 20-24 wired, 28, 82, the per-station and
 * review rows). The pure helpers have their own tests; these prove the model wires them.
 */
import { LOT_WORKTREE } from '../../../test/report-events.constants.ts'
import {
	eventOf,
	partOf,
	recordsOf,
	stationRun,
	stepRun,
	timeOf,
} from '../../../test/report-events.ts'
import { buildLotReport } from './lot-report.ts'

import { describe, expect, it } from 'vitest'

import type { LotEvent } from './event.types.ts'
import type { LotReportInput } from './lot-report.types.ts'
import type { SuiteFamily } from './unrecorded-steps.types.ts'

const SUITE_FAMILIES: SuiteFamily[] = [
	'gate-fast',
	'gate-full',
	'gate-release',
	'gate-hook',
	'contrib',
	'tdd-red',
	'tdd-green',
	'mutation',
	'rehearsal',
	'handover-run',
]

// Orders the model promises: stations are listed by the order of their first run, skills alphabetically by name,
// agents by the order of their first run, review rounds ascending.

/** A lot created at 10:00 and committed at 10:30, 2 steps, its worktree on disk, no event, no record. */
function inputOf(overrides: Partial<LotReportInput> = {}): LotReportInput {
	return {
		now: timeOf('12:00'),
		identity: {
			name: '0171-scl-subscribe',
			state: 'committed',
			feature: 'dataflow-subscribe',
			effort: 'high',
			steps: 2,
			created: timeOf('10:00'),
			worktree: LOT_WORKTREE,
		},
		transitions: [
			{ at: timeOf('10:02'), to: 'working' },
			{ at: timeOf('10:30'), to: 'committed' },
		],
		questions: [],
		events: [],
		damaged: 0,
		unknownKinds: 0,
		ledger: [],
		roundFolders: [],
		records: [],
		goneWorktrees: [],
		mutationRuns: [],
		...overrides,
	}
}

describe('buildLotReport: a lot without any event (case 28)', () => {
	it('transitions and ledger only → no stations, no runs, no tokens known, the elapsed time from the transitions', () => {
		expect(
			buildLotReport(
				inputOf({
					ledger: [
						{ round: 1, severity: 'blocking', state: 'fixed' },
						{ round: 1, severity: 'nit', state: 'accepted' },
					],
				}),
			),
		).toMatchObject({
			lot: '0171-scl-subscribe',
			state: 'committed',
			feature: 'dataflow-subscribe',
			effort: 'high',
			steps: 2,
			rounds: 1,
			stations: [],
			runs: [],
			totals: { tokens: { total: { value: null } }, money: [], time: { elapsed: 1800 } },
			events: { count: 0, damaged: 0, duplicates: 0, unknownKinds: 0 },
		})
	})

	it('no event at all → every suite family unknown (no event recorded), no count of 0', () => {
		expect(buildLotReport(inputOf()).suites.families).toMatchObject(
			Object.fromEntries(
				SUITE_FAMILIES.map((family) => [
					family,
					{ known: false, runs: null, unknownReason: 'no event recorded' },
				]),
			),
		)
	})
})

describe('buildLotReport: tokens and money (cases 20, 21, 22, 82)', () => {
	it('stations with a total of 100, input 10 and output 5, nothing, and a total of 0 → the lot is 115, 2 of 4 stations not exact', () => {
		const events = [
			...stationRun({
				run: 'a',
				station: 'test-writer',
				start: '10:00',
				end: '10:05',
				endFields: { tokens: { total: 100 } },
			}),
			...stationRun({
				run: 'b',
				station: 'implementer',
				start: '10:06',
				end: '10:10',
				endFields: { tokens: { input: 10, output: 5 } },
			}),
			...stationRun({ run: 'c', station: 'reviewer', start: '10:11', end: '10:12' }),
			...stationRun({
				run: 'd',
				station: 'test-reviewer',
				start: '10:13',
				end: '10:14',
				endFields: { tokens: { total: 0 } },
			}),
		]

		expect(buildLotReport(inputOf({ events })).totals.tokens.total).toEqual({
			value: 115,
			exact: false,
			notExact: 2,
			stations: 4,
		})
	})

	it('no station reported any tokens → the lot total is null, not 0', () => {
		const events = stationRun({ run: 'a', station: 'implementer', start: '10:00', end: '10:05' })

		expect(buildLotReport(inputOf({ events })).totals.tokens.total.value).toBeNull()
	})

	it('money reported in two currencies → two sums', () => {
		const events = [
			...stationRun({
				run: 'a',
				station: 'implementer',
				start: '10:00',
				end: '10:05',
				endFields: { money: { amount: 1, currency: 'EUR' } },
			}),
			...stationRun({
				run: 'b',
				station: 'reviewer',
				start: '10:06',
				end: '10:09',
				endFields: { money: { amount: 3, currency: 'USD' } },
			}),
			...stationRun({
				run: 'c',
				station: 'reviewer',
				start: '10:10',
				end: '10:12',
				endFields: { money: { amount: 2, currency: 'EUR' } },
			}),
		]

		expect(buildLotReport(inputOf({ events })).totals.money).toEqual([
			{ currency: 'EUR', amount: 3 },
			{ currency: 'USD', amount: 3 },
		])
	})

	it('reader runs recorded as station runs standard-reader with tokens, plus ask.* events → the tokens counted once', () => {
		const events: LotEvent[] = [
			...stationRun({
				run: 'r1',
				station: 'standard-reader',
				start: '10:00',
				end: '10:05',
				endFields: { tokens: { total: 100 } },
			}),
			...stationRun({
				run: 'r2',
				station: 'standard-reader',
				start: '10:00',
				end: '10:06',
				endFields: { tokens: { total: 200 } },
			}),
			eventOf({ id: 'ev-ask-1', at: timeOf('10:01'), kind: 'ask.reader', tokens: { total: 999 } }),
			eventOf({ id: 'ev-ask-2', at: timeOf('10:06'), kind: 'ask.result' }),
		]
		expect(buildLotReport(inputOf({ events }))).toMatchObject({
			totals: {
				tokens: {
					total: { value: 300, exact: true, notExact: 0, stations: 2 },
					fields: { total: { known: 300, unknownStations: 0 } },
				},
			},
			stations: [{ station: 'standard-reader', runs: 2 }],
		})
	})
})

describe('buildLotReport: a station run (case 23)', () => {
	it('a start at 10:00, an end at 10:05 and a duration of 120 → measured 5 minutes, reported 2 minutes, both kept', () => {
		const events = stationRun({
			run: 'a',
			station: 'implementer',
			start: '10:00',
			end: '10:05',
			endFields: { duration: 120 },
		})

		expect(buildLotReport(inputOf({ events })).runs[0].time).toEqual({
			measuredSeconds: 300,
			reportedSeconds: 120,
			seconds: 300,
		})
	})

	it('an end before its start (the clock stepped back) → measured unknown, the reported duration kept', () => {
		const events = stationRun({
			run: 'a',
			station: 'implementer',
			start: '10:05',
			end: '10:00',
			endFields: { duration: 120 },
		})

		expect(buildLotReport(inputOf({ events })).runs[0].time).toEqual({
			measuredSeconds: null,
			reportedSeconds: 120,
			seconds: 120,
		})
	})

	it('an end with no start and no duration → measured and reported unknown', () => {
		const events = stationRun({ run: 'a', station: 'implementer', start: null, end: '10:05' })

		expect(buildLotReport(inputOf({ events })).runs[0].time).toEqual({
			measuredSeconds: null,
			reportedSeconds: null,
			seconds: null,
		})
	})

	it('a start with no end on an open lot → status running; on a terminal lot → no end; an ended one → ended', () => {
		const open = stationRun({ run: 'a', station: 'implementer', start: '10:00', end: null })
		const ended = stationRun({ run: 'b', station: 'reviewer', start: '10:00', end: '10:05' })
		const working = { ...inputOf().identity, state: 'working' }

		expect([
			buildLotReport(inputOf({ identity: working, events: open })).runs[0].status,
			buildLotReport(inputOf({ events: open })).runs[0].status,
			buildLotReport(inputOf({ events: ended })).runs[0].status,
		]).toEqual(['running', 'no end', 'ended'])
	})

	it('a run carrying vendor, effort, session and money → the row keeps them; a run without them holds null', () => {
		const rich = stationRun({
			run: 'a',
			station: 'reviewer',
			start: '10:00',
			end: '10:05',
			startFields: { vendor: 'vendor-a', effort: 'high', session: 'session-1' },
			endFields: { money: { amount: 1.5, currency: 'EUR' } },
		})
		const bare = stationRun({ run: 'b', station: 'reviewer', start: '10:06', end: '10:07' })

		expect(buildLotReport(inputOf({ events: [...rich, ...bare] })).runs).toMatchObject([
			{
				run: 'a',
				vendor: 'vendor-a',
				effort: 'high',
				session: 'session-1',
				money: { amount: 1.5, currency: 'EUR' },
			},
			{ run: 'b', vendor: null, effort: null, session: null, money: null },
		])
	})

	it('a run carries what its start and its end gave: step, round, attempt, agent, executor, tier, model, verdict, exit', () => {
		const events = stationRun({
			run: 'a',
			station: 'reviewer',
			start: '10:00',
			end: '10:05',
			startFields: {
				step: 1,
				round: 2,
				attempt: 3,
				agent: 'dialecte-reviewer',
				executor: 'host',
				tier: 'strong',
				model: 'model-a',
			},
			endFields: { verdict: 'approve', exit: 0, tokens: { total: 320 } },
		})

		expect(buildLotReport(inputOf({ events })).runs[0]).toMatchObject({
			run: 'a',
			station: 'reviewer',
			step: 1,
			round: 2,
			attempt: 3,
			agent: 'dialecte-reviewer',
			executor: 'host',
			tier: 'strong',
			model: 'model-a',
			verdict: 'approve',
			exit: 0,
			tokens: { value: 320, exactness: 'exact' },
		})
	})
})

describe('buildLotReport: time (case 24)', () => {
	it('an open lot → its elapsed time ends at now, not at its last event', () => {
		const identity = { ...inputOf().identity, state: 'working' }
		const events = stationRun({ run: 'a', station: 'implementer', start: '10:00', end: '10:05' })

		expect(
			buildLotReport(inputOf({ identity, events, transitions: [], now: timeOf('10:20') })).totals
				.time,
		).toMatchObject({ elapsed: 1200, agents: 300, other: 900 })
	})

	it('a terminal lot → its elapsed time ends at the last event when it is later than the last transition', () => {
		const events = stationRun({ run: 'a', station: 'implementer', start: '10:00', end: '10:45' })

		expect(buildLotReport(inputOf({ events })).totals.time.elapsed).toBe(2700)
	})

	it('step.wait events → waiting for the machine is their intervals [at - waitedMs, at]; none → 0', () => {
		const events = [
			eventOf({
				id: 'ev-wait',
				at: timeOf('10:10'),
				kind: 'step.wait',
				by: 'cli',
				step: 'gate-full',
				waitedMs: 120_000,
			}),
		]

		expect([
			buildLotReport(inputOf({ events })).totals.time.machine,
			buildLotReport(inputOf()).totals.time.machine,
		]).toEqual([120, 0])
	})

	it('a question answered and one still open → waiting for answers, an open one lasting to now', () => {
		const identity = { ...inputOf().identity, state: 'working' }
		const questions = [
			{ asked: timeOf('10:00'), answered: timeOf('10:05') },
			{ asked: timeOf('10:10'), answered: null },
		]

		expect(
			buildLotReport(inputOf({ identity, questions, transitions: [], now: timeOf('10:20') })).totals
				.time,
		).toMatchObject({ elapsed: 1200, waiting: 900, other: 300 })
	})
})

describe('buildLotReport: per station, agents and skills', () => {
	const SKILLS_RUN_1 = [
		{ name: 'dialecte-lot', hash: 'a1b2c3d4', how: 'seen' },
		{ name: 'tdd', hash: null, how: 'asked' },
	]
	const SKILLS_RUN_2 = [
		{ name: 'dialecte-lot', hash: 'a1b2c3d4', how: 'seen' },
		{ name: 'tdd', hash: '7e8f9a0b', how: 'seen' },
	]
	const SKILLS_RUN_3 = [{ name: 'extra-skill', hash: null, how: 'asked' }]
	const EVENTS = [
		...stationRun({
			run: 'a',
			station: 'reviewer',
			start: '10:00',
			end: '10:10',
			startFields: { agent: 'agent-a' },
			endFields: { tokens: { total: 600 }, skills: SKILLS_RUN_1 },
		}),
		...stationRun({
			run: 'b',
			station: 'reviewer',
			start: '10:11',
			end: '10:16',
			startFields: { agent: 'agent-b' },
			endFields: { tokens: { total: 300 }, skills: SKILLS_RUN_2 },
		}),
		...stationRun({
			run: 'c',
			station: 'implementer',
			start: '10:17',
			end: '10:20',
			startFields: { agent: 'agent-a' },
			endFields: { skills: SKILLS_RUN_3 },
		}),
	]

	it('two runs of one station → the station row sums the runs, time and tokens', () => {
		expect(buildLotReport(inputOf({ events: EVENTS })).stations).toMatchObject([
			{ station: 'reviewer', runs: 2, seconds: 900, tokens: { value: 900, exactness: 'exact' } },
			{ station: 'implementer', runs: 1 },
		])
	})

	it('runs of agents → each agent distinct with its run count, per station and for the lot', () => {
		expect(buildLotReport(inputOf({ events: EVENTS }))).toMatchObject({
			stations: [
				{
					station: 'reviewer',
					agents: [
						{ name: 'agent-a', runs: 1 },
						{ name: 'agent-b', runs: 1 },
					],
				},
				{ station: 'implementer', agents: [{ name: 'agent-a', runs: 1 }] },
			],
			agents: [
				{ name: 'agent-a', runs: 2 },
				{ name: 'agent-b', runs: 1 },
			],
		})
	})

	it('skills seen and asked → each distinct with its counts; one asked and never seen is flagged, one asked in a run and seen in another is not', () => {
		expect(buildLotReport(inputOf({ events: EVENTS })).skills).toEqual([
			{ name: 'dialecte-lot', hash: 'a1b2c3d4', seen: 2, asked: 0, askedNotSeen: false },
			{ name: 'extra-skill', hash: null, seen: 0, asked: 1, askedNotSeen: true },
			{ name: 'tdd', hash: '7e8f9a0b', seen: 1, asked: 1, askedNotSeen: false },
		])
	})

	it('a station with an exact run and a run that reported no tokens → its total is a lower bound (at least), not exact', () => {
		const events = [
			...stationRun({
				run: 'a',
				station: 'reviewer',
				start: '10:00',
				end: '10:05',
				endFields: { tokens: { total: 100 } },
			}),
			...stationRun({ run: 'b', station: 'reviewer', start: '10:06', end: '10:07' }),
		]

		expect(buildLotReport(inputOf({ events })).stations).toMatchObject([
			{ station: 'reviewer', tokens: { value: 100, exactness: 'atLeast' } },
		])
	})

	it('a station none of whose runs reported tokens → unknown (null), not 0', () => {
		const events = stationRun({ run: 'a', station: 'reviewer', start: '10:00', end: '10:05' })

		expect(buildLotReport(inputOf({ events })).stations).toMatchObject([
			{ station: 'reviewer', tokens: { value: null, exactness: 'unknown' } },
		])
	})

	it('a station whose runs reported money in two currencies → its row sums them per currency', () => {
		const events = [
			...stationRun({
				run: 'a',
				station: 'reviewer',
				start: '10:00',
				end: '10:05',
				endFields: { money: { amount: 1, currency: 'EUR' } },
			}),
			...stationRun({
				run: 'b',
				station: 'reviewer',
				start: '10:06',
				end: '10:07',
				endFields: { money: { amount: 2, currency: 'USD' } },
			}),
			...stationRun({
				run: 'c',
				station: 'reviewer',
				start: '10:08',
				end: '10:09',
				endFields: { money: { amount: 3, currency: 'EUR' } },
			}),
		]

		expect(buildLotReport(inputOf({ events })).stations[0].money).toEqual([
			{ currency: 'EUR', amount: 4 },
			{ currency: 'USD', amount: 2 },
		])
	})

	it('a station none of whose runs has a time (an end with no start and no duration) → seconds null, not 0', () => {
		const events = stationRun({ run: 'a', station: 'reviewer', start: null, end: '10:05' })

		expect(buildLotReport(inputOf({ events })).stations).toMatchObject([
			{ station: 'reviewer', runs: 1, seconds: null },
		])
	})

	it('a station with a run of 300 seconds and a run with no time → seconds 300 (the unknown run adds nothing)', () => {
		const events = [
			...stationRun({ run: 'a', station: 'reviewer', start: '10:00', end: '10:05' }),
			...stationRun({ run: 'b', station: 'reviewer', start: null, end: '10:09' }),
		]

		expect(buildLotReport(inputOf({ events })).stations).toMatchObject([
			{ station: 'reviewer', runs: 2, seconds: 300 },
		])
	})

	it('stations whose runs reported suites themselves → each station row and the lot (reportedSuites) sum them by name', () => {
		const events = [
			...stationRun({
				run: 'a',
				station: 'implementer',
				start: '10:00',
				end: '10:05',
				endFields: { suites: { unit: 2 } },
			}),
			...stationRun({
				run: 'b',
				station: 'reviewer',
				start: '10:06',
				end: '10:09',
				endFields: { suites: { unit: 4, e2e: 1 } },
			}),
			...stationRun({
				run: 'c',
				station: 'reviewer',
				start: '10:10',
				end: '10:12',
				endFields: { suites: { unit: 1 } },
			}),
		]

		expect(buildLotReport(inputOf({ events }))).toMatchObject({
			stations: [
				{ station: 'implementer', reported: { unit: 2 } },
				{ station: 'reviewer', reported: { unit: 5, e2e: 1 } },
			],
			reportedSuites: { unit: 7, e2e: 1 },
		})
	})
})

describe('buildLotReport: heavy steps and folders', () => {
	const EVENTS = [
		...stepRun({
			run: 'f1',
			step: 'gate-full',
			start: '10:00',
			end: '10:04',
			endFields: { durationMs: 220_000, heavy: true },
		}),
		...stepRun({
			run: 'g1',
			step: 'gate-fast',
			start: '10:10',
			end: '10:14',
			endFields: {
				durationMs: 200_000,
				parts: [
					partOf({ name: 'e2e', heavy: true, durationMs: 125_000 }),
					partOf({ name: 'lint', durationMs: 5_000 }),
					partOf({ name: 'browser', heavy: true, reused: true, durationMs: 0 }),
				],
			},
		}),
		...stepRun({
			run: 'w1',
			step: 'worktree-add',
			start: '09:50',
			end: '09:51',
			endFields: { durationMs: 46_000, parts: { nodeModules: 'cloned', npmCi: false } },
		}),
		...stepRun({
			run: 'a1',
			step: 'throwaway-add',
			start: '10:20',
			end: '10:21',
			endFields: { durationMs: 5_000 },
		}),
		...stepRun({
			run: 'a2',
			step: 'throwaway-add',
			start: '10:30',
			end: '10:31',
			endFields: { durationMs: 7_000 },
		}),
		...[1, 2, 3].map((index) =>
			eventOf({
				id: `ev-trash-${index}`,
				at: timeOf('10:40'),
				kind: 'folder',
				by: 'cli',
				action: 'trash',
				path: `/p/${index}`,
				durationMs: 2_000,
			}),
		),
	]

	it('a heavy kind run and a heavy part that ran → listed with their durations; a reused heavy part and a plain part are not', () => {
		expect(buildLotReport(inputOf({ events: EVENTS })).heavy).toEqual([
			{ step: 'gate-full', seconds: 220 },
			{ step: 'gate-fast: e2e', seconds: 125 },
		])
	})

	it('worktree-add 46 seconds cloned, two throwaways of 5 and 7 seconds, three trash actions → the folders row', () => {
		expect(buildLotReport(inputOf({ events: EVENTS })).folders).toEqual({
			worktreeAdd: { count: 1, seconds: 46, nodeModules: { cloned: 1 } },
			throwaways: { count: 2, seconds: 12 },
			actions: { trash: { count: 3, seconds: 6 } },
		})
	})

	it('no heavy step and no folder step → nothing listed, zero counts', () => {
		expect(buildLotReport(inputOf())).toMatchObject({
			heavy: [],
			folders: {
				worktreeAdd: { count: 0, seconds: 0, nodeModules: {} },
				throwaways: { count: 0, seconds: 0 },
				actions: {},
			},
		})
	})
})

describe('buildLotReport: review rounds from the ledger and the round folders', () => {
	it('ledger rows in rounds 1 and 2 and a round-3 folder → 3 rounds, findings per round by severity and by state', () => {
		expect(
			buildLotReport(
				inputOf({
					ledger: [
						{ round: 1, severity: 'blocking', state: 'fixed' },
						{ round: 1, severity: 'blocking', state: 'fixed' },
						{ round: 1, severity: 'should-fix', state: 'accepted' },
						{ round: 1, severity: 'nit', state: 'gone' },
						{ round: 2, severity: 'blocking', state: 'fixed' },
					],
					roundFolders: ['round-3'],
				}),
			),
		).toMatchObject({
			rounds: 3,
			review: [
				{
					round: 1,
					findings: 4,
					bySeverity: { blocking: 2, 'should-fix': 1, nit: 1 },
					byState: { fixed: 2, accepted: 1, gone: 1 },
				},
				{ round: 2, findings: 1, bySeverity: { blocking: 1 }, byState: { fixed: 1 } },
				{ round: 3, findings: 0, bySeverity: {}, byState: {} },
			],
		})
	})

	it('round folders that repeat a ledger round, and names that are not rounds → each round once, other names ignored', () => {
		expect(
			buildLotReport(
				inputOf({
					ledger: [{ round: 1, severity: 'nit', state: 'fixed' }],
					roundFolders: ['round-1', 'round-2', 'notes', 'round-x', 'round-'],
				}),
			),
		).toMatchObject({ rounds: 2, review: [{ round: 1 }, { round: 2 }] })
	})

	it('no ledger row and no round folder → 0 rounds, no review row', () => {
		expect(buildLotReport(inputOf())).toMatchObject({ rounds: 0, review: [] })
	})
})

describe('buildLotReport: suites and events wired', () => {
	it('five gate-fast runs on a lot of 2 steps whose ledger holds 2 rounds → limit 3 (S + R - 1), over', () => {
		const events = [
			...stepRun({ run: 'g1', step: 'gate-fast', start: '10:00', end: '10:02' }),
			...stepRun({ run: 'g2', step: 'gate-fast', start: '10:03', end: '10:05' }),
			...stepRun({ run: 'g3', step: 'gate-fast', start: '10:06', end: '10:08' }),
			...stepRun({ run: 'g4', step: 'gate-fast', start: '10:09', end: '10:11' }),
			...stepRun({ run: 'g5', step: 'gate-fast', start: '10:12', end: '10:14' }),
		]

		expect(
			buildLotReport(
				inputOf({
					events,
					ledger: [
						{ round: 1, severity: 'nit', state: 'fixed' },
						{ round: 2, severity: 'nit', state: 'fixed' },
					],
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:13') })],
				}),
			).suites.families['gate-fast'],
		).toMatchObject({ runs: 5, limit: 3, over: true })
	})

	it('stations recorded with suites but no step event and no record → the reported suites listed, every family unknown', () => {
		const events = stationRun({
			run: 'a',
			station: 'implementer',
			start: '10:00',
			end: '10:30',
			endFields: { suites: { unit: 6 } },
		})
		expect(buildLotReport(inputOf({ events }))).toMatchObject({
			reportedSuites: { unit: 6 },
			suites: {
				families: { 'gate-fast': { known: false, unknownReason: 'no step left a trace' } },
			},
		})
	})

	it('two events with one host id, a damaged line and an unknown kind → the model counts the events kept, the duplicate, the damaged and the unknown kinds', () => {
		const events = [
			eventOf({
				id: 'ev-1',
				at: timeOf('10:00'),
				kind: 'station.end',
				run: 'a',
				station: 'implementer',
				hostEvent: 'h-1',
			}),
			eventOf({
				id: 'ev-2',
				at: timeOf('10:00:01'),
				kind: 'station.end',
				run: 'a',
				station: 'implementer',
				hostEvent: 'h-1',
			}),
		]

		expect(buildLotReport(inputOf({ events, damaged: 1, unknownKinds: 2 })).events).toEqual({
			count: 1,
			damaged: 1,
			duplicates: 1,
			unknownKinds: 2,
		})
	})
})
