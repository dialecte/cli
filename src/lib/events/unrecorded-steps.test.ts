/**
 * The suites of a lot: counts, limits, reuse, and the rules that make a count unknown (33L0 section 7; cases 11
 * (report half), 25, 26, 27, 81 (byStation), 89, 90, 91, 94, 95 and the D14 totals).
 */
import { LOT_WORKTREE, THROWAWAY_WORKTREE } from '../../../test/report-events.constants.ts'
import {
	eventOf,
	pairedOf,
	partOf,
	recordsOf,
	stationRun,
	stepRun,
	timeOf,
} from '../../../test/report-events.ts'
import { countSuites } from './unrecorded-steps.ts'

import { describe, expect, it } from 'vitest'

import type { LotEvent } from './event.types.ts'
import type { CountSuitesParams, SuiteFamily } from './unrecorded-steps.types.ts'

const NO_STEP_EVENTS = { worktreeCli: { version: '0.3.1', stepEvents: false } }
const STEP_EVENTS = { worktreeCli: { version: '0.3.1', stepEvents: true } }
const ALL_FAMILIES: SuiteFamily[] = [
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
const UNRECORDED = 'a run no event records'
const GONE = "the worktree's records are gone"

/** The params of a count: a terminal lot of 2 steps and 2 rounds, no ledger, no record; the events given. */
function paramsOf(
	params: { events: LotEvent[] } & Partial<Omit<CountSuitesParams, 'paired'>>,
): CountSuitesParams {
	const { events, ...overrides } = params
	return {
		now: timeOf('12:00'),
		worktree: LOT_WORKTREE,
		steps: 2,
		rounds: 2,
		terminal: true,
		paired: pairedOf({ events }),
		ledger: [],
		records: [],
		goneWorktrees: [],
		mutationRuns: [],
		...overrides,
	}
}

/** A gate-fast run in the lot's worktree. */
function gateFast(params: { run: string; start: string; end: string }): LotEvent[] {
	return stepRun({ run: params.run, step: 'gate-fast', start: params.start, end: params.end })
}

describe('countSuites: counts and limits (case 25)', () => {
	const FIVE = [
		...gateFast({ run: 'g1', start: '10:00', end: '10:02' }),
		...gateFast({ run: 'g2', start: '10:10', end: '10:12' }),
		...gateFast({ run: 'g3', start: '10:20', end: '10:22' }),
		...gateFast({ run: 'g4', start: '10:30', end: '10:32' }),
		...gateFast({ run: 'g5', start: '10:40', end: '10:42' }),
	]

	it('five gate-fast runs in the lot worktree on a lot of 2 steps and 2 rounds → 5 runs, limit 3, over', () => {
		expect(
			countSuites(
				paramsOf({
					events: FIVE,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:41') })],
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: 5, known: true, limit: 3, over: true })
	})

	it('three gate-fast runs on the same lot → 3 runs, limit 3, not over', () => {
		expect(countSuites(paramsOf({ events: FIVE.slice(0, 6) })).families['gate-fast']).toMatchObject(
			{ runs: 3, limit: 3, over: false },
		)
	})

	it('a lot whose steps are unknown (null) → gate-fast limit null, never over', () => {
		expect(
			countSuites(paramsOf({ events: FIVE, steps: null })).families['gate-fast'],
		).toMatchObject({ runs: 5, limit: null, over: false })
	})

	it('a lot whose rounds are unknown (null) → gate-fast limit null, never over', () => {
		expect(
			countSuites(paramsOf({ events: FIVE, rounds: null })).families['gate-fast'],
		).toMatchObject({ runs: 5, limit: null, over: false })
	})

	it('R4-10: a lot of 1 step and 0 rounds → gate-fast limit 1 (S + max(R, 1) - 1), never 0', () => {
		expect(
			countSuites(paramsOf({ events: FIVE.slice(0, 2), steps: 1, rounds: 0 })).families[
				'gate-fast'
			],
		).toMatchObject({ limit: 1, over: false })
	})

	it('R4-10: a lot of 3 steps and 0 rounds, two gate-fast runs → limit 3, not over', () => {
		expect(
			countSuites(paramsOf({ events: FIVE.slice(0, 4), steps: 3, rounds: 0 })).families[
				'gate-fast'
			],
		).toMatchObject({ runs: 2, limit: 3, over: false })
	})

	it('three gate-full runs, one of them failed → limit 1 + 1 = 2, over', () => {
		const events = [
			...stepRun({
				run: 'f1',
				step: 'gate-full',
				start: '10:00',
				end: '10:02',
				endFields: { exit: 1 },
			}),
			...stepRun({ run: 'f2', step: 'gate-full', start: '10:10', end: '10:12' }),
			...stepRun({ run: 'f3', step: 'gate-full', start: '10:20', end: '10:22' }),
		]

		expect(countSuites(paramsOf({ events })).families['gate-full']).toMatchObject({
			runs: 3,
			limit: 2,
			over: true,
		})
	})

	it('three gate-full runs, two of them failed → limit 1 + 2 = 3, not over', () => {
		const events = [
			...stepRun({
				run: 'f1',
				step: 'gate-full',
				start: '10:00',
				end: '10:02',
				endFields: { exit: 1 },
			}),
			...stepRun({
				run: 'f2',
				step: 'gate-full',
				start: '10:10',
				end: '10:12',
				endFields: { exit: 2 },
			}),
			...stepRun({ run: 'f3', step: 'gate-full', start: '10:20', end: '10:22' }),
		]

		expect(countSuites(paramsOf({ events })).families['gate-full']).toMatchObject({
			runs: 3,
			limit: 3,
			over: false,
		})
	})

	it('three gate-release runs → counted, limit null (none is set), never over', () => {
		const events = [
			...stepRun({ run: 'r1', step: 'gate-release', start: '10:00', end: '10:02' }),
			...stepRun({ run: 'r2', step: 'gate-release', start: '10:10', end: '10:12' }),
			...stepRun({ run: 'r3', step: 'gate-release', start: '10:20', end: '10:22' }),
		]

		expect(countSuites(paramsOf({ events })).families['gate-release']).toMatchObject({
			runs: 3,
			limit: null,
			over: false,
		})
	})

	it('a run ended with outcome interrupted → counted in the runs and in interrupted', () => {
		const events = stepRun({
			run: 'g1',
			step: 'gate-fast',
			start: '10:00',
			end: '10:02',
			endFields: { outcome: 'interrupted', exit: undefined },
		})

		expect(
			countSuites(
				paramsOf({
					events,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:01') })],
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: 1, interrupted: 1, known: true })
	})

	it('a start with no end on a terminal lot → one run, interrupted, the count stays known', () => {
		const events = stepRun({ run: 'g1', step: 'gate-fast', start: '10:00', end: null })

		expect(countSuites(paramsOf({ events, terminal: true })).families['gate-fast']).toMatchObject({
			runs: 1,
			interrupted: 1,
			known: true,
		})
	})

	it('a start with no end on an open lot → one run still running (not interrupted), a record after it is held', () => {
		const events = stepRun({ run: 'g1', step: 'gate-fast', start: '10:00', end: null })

		expect(
			countSuites(
				paramsOf({
					events,
					terminal: false,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:30') })],
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: 1, interrupted: 0, known: true })
	})
})

describe('countSuites: the throwaways apart (cases 25, 95)', () => {
	const EVENTS = [
		...gateFast({ run: 'g1', start: '10:00', end: '10:02' }),
		...stepRun({
			run: 't1',
			step: 'gate-fast',
			start: '10:10',
			end: '10:12',
			worktree: THROWAWAY_WORKTREE,
			throwaway: true,
		}),
		...stepRun({
			run: 't2',
			step: 'gate-fast',
			start: '10:20',
			end: '10:22',
			worktree: THROWAWAY_WORKTREE,
			throwaway: true,
		}),
	]
	const FIXED = [{ round: 1, severity: 'blocking', state: 'fixed' }]

	it('two gate-fast runs in a throwaway beside the lot worktree one → their own row, not in the lot count', () => {
		expect(
			countSuites(
				paramsOf({
					events: EVENTS,
					ledger: FIXED,
					records: [
						recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:01') }),
						recordsOf({ worktree: THROWAWAY_WORKTREE, gateFast: timeOf('10:21') }),
					],
				}),
			),
		).toMatchObject({
			families: { 'gate-fast': { runs: 1 } },
			throwaways: { 'gate-fast': { runs: 2, known: true } },
		})
	})

	it('two throwaway gate-fast runs and one fixed finding in the ledger → limit 1, over', () => {
		expect(
			countSuites(paramsOf({ events: EVENTS, ledger: FIXED })).throwaways['gate-fast'],
		).toMatchObject({
			runs: 2,
			limit: 1,
			over: true,
		})
	})

	it('two throwaway gate-fast runs and two fixed findings (one gone, not counted) → limit 2, not over', () => {
		const ledger = [
			{ round: 1, severity: 'blocking', state: 'fixed' },
			{ round: 1, severity: 'nit', state: 'fixed' },
			{ round: 2, severity: 'nit', state: 'gone' },
		]

		expect(countSuites(paramsOf({ events: EVENTS, ledger })).throwaways['gate-fast']).toMatchObject(
			{
				runs: 2,
				limit: 2,
				over: false,
			},
		)
	})

	it('a throwaway gate-fast record held by no throwaway run → the throwaway row unknown (a run no event records), the lot row untouched', () => {
		expect(
			countSuites(
				paramsOf({
					events: EVENTS,
					ledger: FIXED,
					records: [
						recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:01') }),
						recordsOf({ worktree: THROWAWAY_WORKTREE, gateFast: timeOf('10:40') }),
					],
				}),
			),
		).toMatchObject({
			families: { 'gate-fast': { runs: 1, known: true } },
			throwaways: {
				'gate-fast': { runs: null, atLeast: 2, known: false, unknownReason: UNRECORDED },
			},
		})
	})

	it('a throwaway whose records are gone → its row unknown (the worktree records are gone), the lot row untouched', () => {
		expect(
			countSuites(
				paramsOf({
					events: EVENTS,
					goneWorktrees: [THROWAWAY_WORKTREE],
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:01') })],
				}),
			),
		).toMatchObject({
			families: { 'gate-fast': { runs: 1, known: true } },
			throwaways: { 'gate-fast': { runs: null, atLeast: 2, known: false, unknownReason: GONE } },
		})
	})
})

describe('countSuites: byStation (case 81)', () => {
	const STATIONS = [
		...stationRun({ run: 'impl', station: 'implementer', start: '10:00', end: '10:30' }),
		...stationRun({ run: 'read-a', station: 'reader', start: '10:40', end: '10:55' }),
		...stationRun({ run: 'read-b', station: 'reader-b', start: '10:45', end: '11:00' }),
		...stationRun({ run: 'review', station: 'reviewer', start: '11:10', end: null }),
	]

	it('a gate-fast inside the implementer, one inside two readers, one between stations → byStation implementer 1, shared 1, outside 1', () => {
		const events = [
			...STATIONS,
			...gateFast({ run: 'g1', start: '10:10', end: '10:11' }),
			...gateFast({ run: 'g2', start: '10:50', end: '10:51' }),
			...gateFast({ run: 'g3', start: '11:05', end: '11:06' }),
		]

		expect(countSuites(paramsOf({ events })).families['gate-fast'].byStation).toEqual({
			implementer: 1,
			shared: 1,
			outside: 1,
		})
	})

	it('a gate-full started while a reviewer is open (no end) → byStation outside 1', () => {
		const events = [
			...STATIONS,
			...stepRun({ run: 'f1', step: 'gate-full', start: '11:20', end: '11:25' }),
		]

		expect(countSuites(paramsOf({ events })).families['gate-full'].byStation).toEqual({
			outside: 1,
		})
	})

	it('a gate-hook inside the open implementer → byStation outside 1 (orchestration)', () => {
		const events = [
			...stationRun({ run: 'impl', station: 'implementer', start: '10:00', end: null }),
			...stepRun({ run: 'k1', step: 'gate-hook', start: '10:10', end: '10:11' }),
		]

		expect(countSuites(paramsOf({ events })).families['gate-hook'].byStation).toEqual({
			outside: 1,
		})
	})
})

describe('countSuites: reuse, reruns, cut parts (case 26, D14)', () => {
	/** A gate-fast run 10:00-10:01 with the given end fields, its record inside. */
	function reuseParams(params: { endFields: Record<string, unknown> }): CountSuitesParams {
		return paramsOf({
			events: stepRun({
				run: 'g1',
				step: 'gate-fast',
				start: '10:00',
				end: '10:01',
				endFields: params.endFields,
			}),
			records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:00:30') })],
		})
	}

	it('a gate answered whole from its record → reused 1 whole, its tdd collect still listed as run', () => {
		expect(
			countSuites(
				reuseParams({
					endFields: {
						reuse: 'whole',
						parts: [partOf({ name: 'type-check', reused: true }), partOf({ name: 'tdd' })],
					},
				}),
			).families['gate-fast'],
		).toMatchObject({
			runs: 1,
			reused: 1,
			partlyReused: 0,
			parts: { 'type-check': { ran: 0, reused: 1 }, tdd: { ran: 1, reused: 0 } },
		})
	})

	it('a gate that reused some parts and ran others → partly reused 1, not reused whole', () => {
		expect(
			countSuites(
				reuseParams({
					endFields: {
						reuse: 'partly',
						parts: [partOf({ name: 'type-check', reused: true }), partOf({ name: 'lint' })],
					},
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: 1, reused: 0, partlyReused: 1 })
	})

	it('a gate with a part marked rerun → one rerun, counted apart', () => {
		expect(
			countSuites(
				reuseParams({
					endFields: { reuse: 'none', parts: [partOf({ name: 'tests', rerun: true })] },
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: 1, reruns: 1 })
	})

	it('a gate with two parts marked rerun → one rerun (a run counts once)', () => {
		expect(
			countSuites(
				reuseParams({
					endFields: {
						reuse: 'none',
						parts: [partOf({ name: 'tests', rerun: true }), partOf({ name: 'lint', rerun: true })],
					},
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: 1, reruns: 1 })
	})

	it('a gate end with partsTotal 300 and partsFailedTotal 5 showing 3 failing parts → 2 failing parts not shown', () => {
		expect(
			countSuites(
				reuseParams({
					endFields: {
						cut: true,
						partsTotal: 300,
						partsFailedTotal: 5,
						parts: [
							partOf({ name: 'a', status: 'failed' }),
							partOf({ name: 'b', status: 'failed' }),
							partOf({ name: 'c', status: 'failed' }),
							partOf({ name: 'd' }),
						],
					},
				}),
			).families['gate-fast'].failingPartsNotShown,
		).toBe(2)
	})

	it('a gate end that was not cut (no totals) → no failing part is missing', () => {
		expect(
			countSuites(reuseParams({ endFields: { parts: [partOf({ name: 'a', status: 'failed' })] } }))
				.families['gate-fast'].failingPartsNotShown,
		).toBe(0)
	})
})

describe('countSuites: a record no run holds (cases 11 report half, 89, 90, 95)', () => {
	type RecordRow = {
		name: string
		family: SuiteFamily
		field: 'gateFast' | 'gateFull' | 'gateRelease' | 'contrib'
		at: string
		known: boolean
	}
	const ROWS: RecordRow[] = []
	for (const [family, field] of [
		['gate-fast', 'gateFast'],
		['gate-full', 'gateFull'],
		['gate-release', 'gateRelease'],
		['contrib', 'contrib'],
	] as const) {
		ROWS.push(
			{
				name: `${family}: a record lying inside its run → known`,
				family,
				field,
				at: '10:09:50',
				known: true,
			},
			{
				name: `${family}: a record exactly at the run's start → known`,
				family,
				field,
				at: '10:00',
				known: true,
			},
			{
				name: `${family}: a record 5 seconds after the run's end → known (the grace)`,
				family,
				field,
				at: '10:10:05',
				known: true,
			},
			{
				name: `${family}: a record 6 seconds after the run's end → unknown (a run no event records)`,
				family,
				field,
				at: '10:10:06',
				known: false,
			},
			{
				name: `${family}: a record before the run's start → unknown (a run no event records)`,
				family,
				field,
				at: '09:59:59',
				known: false,
			},
		)
	}

	for (const row of ROWS)
		it(row.name, () => {
			const events = stepRun({ run: 'r1', step: row.family, start: '10:00', end: '10:10' })

			expect(
				countSuites(
					paramsOf({
						events,
						records: [recordsOf({ worktree: LOT_WORKTREE, [row.field]: timeOf(row.at) })],
					}),
				).families[row.family],
			).toMatchObject(
				row.known
					? { runs: 1, known: true, unknownReason: null }
					: { runs: null, atLeast: 1, known: false, unknownReason: UNRECORDED },
			)
		})

	it('a gate-fast record lying in no gate-fast run, but inside a gate-full run → gate-fast unknown (the match is per family), never 0', () => {
		const events = stepRun({ run: 'g', step: 'gate-full', start: '10:15', end: '10:25' })

		expect(
			countSuites(
				paramsOf({
					events,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:20') })],
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: null, atLeast: 0, known: false, unknownReason: UNRECORDED })
	})

	it('a frozen record lying inside its run (the lot worktree is gone, its times were kept) → gate-fast known', () => {
		const events = gateFast({ run: 'g', start: '10:00', end: '10:02' })

		expect(
			countSuites(
				paramsOf({
					events,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:01') })],
					goneWorktrees: [],
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: 1, known: true })
	})

	it('an unrecorded lot-worktree gate-fast record whose time falls inside a throwaway gate-fast run → not matched (other worktree), gate-fast unknown', () => {
		const events = [
			...gateFast({ run: 'g1', start: '09:00', end: '09:02' }),
			...stepRun({
				run: 't1',
				step: 'gate-fast',
				start: '10:29',
				end: '10:31',
				worktree: THROWAWAY_WORKTREE,
				throwaway: true,
			}),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [
						recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:30') }),
						recordsOf({ worktree: THROWAWAY_WORKTREE, gateFast: timeOf('10:30') }),
					],
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: null, atLeast: 1, known: false, unknownReason: UNRECORDED })
	})

	it('the same lot-worktree record lying inside a run of the lot worktree itself → gate-fast known', () => {
		const events = gateFast({ run: 'g1', start: '10:29', end: '10:31' })

		expect(
			countSuites(
				paramsOf({
					events,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:30') })],
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: 1, known: true })
	})

	it('a hook record lying inside the handover-run run → gate-hook known, matched to the handover-run and never to a gate-hook end', () => {
		const events = [
			...stepRun({ run: 'h1', step: 'handover-run', start: '10:00', end: '10:05' }),
			...stepRun({ run: 'k1', step: 'gate-hook', start: '10:01', end: '10:03' }),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateHook: timeOf('10:04:30') })],
				}),
			).families['gate-hook'],
		).toMatchObject({ runs: 1, known: true })
	})

	it('a hook record lying inside no handover-run run → gate-hook unknown even with a gate-hook run around it', () => {
		const events = [
			...stepRun({ run: 'h1', step: 'handover-run', start: '10:00', end: '10:05' }),
			...stepRun({ run: 'k1', step: 'gate-hook', start: '10:20', end: '10:30' }),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateHook: timeOf('10:25') })],
				}),
			).families['gate-hook'],
		).toMatchObject({ runs: null, known: false, unknownReason: UNRECORDED })
	})

	it('a tdd-red ledger entry in no tdd-red run (a tdd-green run holds its time) → tdd-red unknown, never 0', () => {
		const events = [
			...stepRun({ run: 'tr', step: 'tdd-red', start: '10:00', end: '10:01' }),
			...stepRun({ run: 'tg', step: 'tdd-green', start: '10:20', end: '10:22' }),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [
						recordsOf({ worktree: LOT_WORKTREE, tdd: [{ at: timeOf('10:21'), step: 'tdd-red' }] }),
					],
				}),
			).families['tdd-red'],
		).toMatchObject({ runs: null, atLeast: 1, known: false, unknownReason: UNRECORDED })
	})

	it('a tdd-green run with its own ledger entry beside an unrecorded red entry → tdd-green known', () => {
		const events = [
			...stepRun({ run: 'tr', step: 'tdd-red', start: '10:00', end: '10:01' }),
			...stepRun({ run: 'tg', step: 'tdd-green', start: '10:20', end: '10:22' }),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [
						recordsOf({
							worktree: LOT_WORKTREE,
							tdd: [
								{ at: timeOf('10:21'), step: 'tdd-green' },
								{ at: timeOf('10:30'), step: 'tdd-red' },
							],
						}),
					],
				}),
			).families['tdd-green'],
		).toMatchObject({ runs: 1, known: true })
	})

	it('a tdd-red ledger entry inside its tdd-red run → tdd-red known', () => {
		const events = stepRun({ run: 'tr', step: 'tdd-red', start: '10:00', end: '10:01' })

		expect(
			countSuites(
				paramsOf({
					events,
					records: [
						recordsOf({
							worktree: LOT_WORKTREE,
							tdd: [{ at: timeOf('10:00:30'), step: 'tdd-red' }],
						}),
					],
				}),
			).families['tdd-red'],
		).toMatchObject({ runs: 1, known: true })
	})

	it('a tdd entry whose step is null (frozen without a kind) inside a tdd-green run → tdd-red stays known, tdd-green known', () => {
		const events = [
			...stepRun({ run: 'tr', step: 'tdd-red', start: '10:00', end: '10:01' }),
			...stepRun({ run: 'tg', step: 'tdd-green', start: '10:20', end: '10:22' }),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [
						recordsOf({ worktree: LOT_WORKTREE, tdd: [{ at: timeOf('10:21'), step: null }] }),
					],
				}),
			).families,
		).toMatchObject({
			'tdd-red': { runs: 1, known: true },
			'tdd-green': { runs: 1, known: true },
		})
	})

	it('a tdd entry whose step is null inside no tdd run → tdd-red and tdd-green both unknown', () => {
		const events = [
			...stepRun({ run: 'tr', step: 'tdd-red', start: '10:00', end: '10:01' }),
			...stepRun({ run: 'tg', step: 'tdd-green', start: '10:20', end: '10:22' }),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [
						recordsOf({ worktree: LOT_WORKTREE, tdd: [{ at: timeOf('11:00'), step: null }] }),
					],
				}),
			).families,
		).toMatchObject({
			'tdd-red': { runs: null, known: false, unknownReason: UNRECORDED },
			'tdd-green': { runs: null, known: false, unknownReason: UNRECORDED },
		})
	})

	it('a mutation run file of the lot worktree inside no mutation run → mutation unknown; one of another worktree is ignored', () => {
		const events = stepRun({ run: 'm1', step: 'mutation', start: '10:00', end: '10:10' })

		expect(
			countSuites(
				paramsOf({
					events,
					mutationRuns: [
						{ worktree: LOT_WORKTREE, startedAt: timeOf('11:00') },
						{ worktree: '/work/other-lot', startedAt: timeOf('11:30') },
					],
				}),
			).families.mutation,
		).toMatchObject({ runs: null, atLeast: 1, known: false, unknownReason: UNRECORDED })
	})

	it('a mutation run file of the lot worktree inside its mutation run → mutation known', () => {
		const events = stepRun({ run: 'm1', step: 'mutation', start: '10:00', end: '10:10' })

		expect(
			countSuites(
				paramsOf({
					events,
					mutationRuns: [{ worktree: LOT_WORKTREE, startedAt: timeOf('10:00:01') }],
				}),
			).families.mutation,
		).toMatchObject({ runs: 1, known: true })
	})
})

describe('countSuites: the other unknown rules (cases 27, 91, 94)', () => {
	it('an event recording worktreeCli.stepEvents false → every family unknown with the reason, the counted ones as at least n, never gate --fast 0', () => {
		const events = [
			...stationRun({ run: 'a', station: 'implementer', start: '10:00', end: '10:30' }),
			...stepRun({
				run: 'g1',
				step: 'gate-fast',
				start: '10:05',
				end: '10:06',
				worktreeCli: NO_STEP_EVENTS,
			}),
			...stepRun({
				run: 'g2',
				step: 'gate-fast',
				start: '10:15',
				end: '10:16',
				worktreeCli: NO_STEP_EVENTS,
			}),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:15:30') })],
				}),
			).families,
		).toMatchObject({
			...Object.fromEntries(ALL_FAMILIES.map((family) => [family, { known: false, runs: null }])),
			'gate-fast': {
				known: false,
				runs: null,
				atLeast: 2,
				unknownReason: "the worktree's cli writes no step events",
			},
		})
	})

	it('an earlier event saying stepEvents false and a later one saying true → still unknown (one false is enough)', () => {
		const events = [
			...stepRun({
				run: 'g1',
				step: 'gate-fast',
				start: '10:05',
				end: '10:06',
				worktreeCli: NO_STEP_EVENTS,
			}),
			...stepRun({
				run: 'g2',
				step: 'gate-fast',
				start: '10:15',
				end: '10:16',
				worktreeCli: STEP_EVENTS,
			}),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:15:30') })],
				}),
			).families['gate-fast'],
		).toMatchObject({
			runs: null,
			atLeast: 2,
			known: false,
			unknownReason: "the worktree's cli writes no step events",
		})
	})

	it('an unreleased main carrying the capability (version 0.3.1, stepEvents true) → counts known', () => {
		const events = [
			...stepRun({
				run: 'g1',
				step: 'gate-fast',
				start: '10:05',
				end: '10:06',
				worktreeCli: STEP_EVENTS,
			}),
			...stepRun({
				run: 'g2',
				step: 'gate-fast',
				start: '10:15',
				end: '10:16',
				worktreeCli: STEP_EVENTS,
			}),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:15:30') })],
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: 2, known: true, unknownReason: null })
	})

	it('a late station end after cleanup (worktreeCli null, the frozen record kept) → gate-fast stays known with its 1 run', () => {
		const events = [
			...stepRun({
				run: 'g1',
				step: 'gate-fast',
				start: '10:05',
				end: '10:06',
				worktreeCli: STEP_EVENTS,
			}),
			...stationRun({
				run: 'a',
				station: 'reviewer',
				start: null,
				end: '13:00',
				endFields: { worktreeCli: null },
			}),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [recordsOf({ worktree: LOT_WORKTREE, gateFast: timeOf('10:05:30') })],
				}),
			).families['gate-fast'],
		).toMatchObject({ runs: 1, known: true })
	})

	it('a step.foreign event naming gate-fast → gate-fast unknown (a run in a moved or copied worktree), the other families unaffected', () => {
		const events = [
			...gateFast({ run: 'g1', start: '10:05', end: '10:06' }),
			...stepRun({ run: 't1', step: 'tdd-red', start: '10:10', end: '10:11' }),
			eventOf({
				id: 'ev-foreign',
				at: timeOf('10:20'),
				kind: 'step.foreign',
				by: 'cli',
				step: 'gate-fast',
				worktree: '/work/moved',
			}),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					records: [
						recordsOf({
							worktree: LOT_WORKTREE,
							gateFast: timeOf('10:05:30'),
							tdd: [{ at: timeOf('10:10:30'), step: 'tdd-red' }],
						}),
					],
				}),
			).families,
		).toMatchObject({
			'gate-fast': {
				runs: null,
				atLeast: 1,
				known: false,
				unknownReason: 'a run in a moved or copied worktree',
			},
			'tdd-red': { runs: 1, known: true },
		})
	})

	it('stations recorded by the host but no step event and no record → every family unknown (no step left a trace)', () => {
		const events = stationRun({ run: 'a', station: 'implementer', start: '10:00', end: '10:30' })

		expect(countSuites(paramsOf({ events })).families).toMatchObject(
			Object.fromEntries(
				ALL_FAMILIES.map((family) => [
					family,
					{ runs: null, known: false, unknownReason: 'no step left a trace' },
				]),
			),
		)
	})

	it('the lot worktree records are gone (no live folder, no frozen line) → every family unknown but mutation, tdd-red included although no event names it', () => {
		const events = [
			...gateFast({ run: 'g1', start: '10:00', end: '10:02' }),
			...gateFast({ run: 'g2', start: '10:10', end: '10:12' }),
		]
		const others = Object.fromEntries(
			ALL_FAMILIES.filter((family) => family !== 'mutation').map((family) => [
				family,
				{ runs: null, known: false, unknownReason: GONE },
			]),
		)

		expect(countSuites(paramsOf({ events, goneWorktrees: [LOT_WORKTREE] })).families).toMatchObject(
			{ ...others, 'gate-fast': { runs: null, atLeast: 2, known: false, unknownReason: GONE } },
		)
	})

	it('the lot worktree records are gone but a mutation run file lies inside its mutation run → mutation known (run files outlive the worktree)', () => {
		const events = [
			...gateFast({ run: 'g1', start: '10:00', end: '10:02' }),
			...stepRun({ run: 'm1', step: 'mutation', start: '10:10', end: '10:20' }),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					goneWorktrees: [LOT_WORKTREE],
					mutationRuns: [{ worktree: LOT_WORKTREE, startedAt: timeOf('10:10:01') }],
				}),
			).families.mutation,
		).toMatchObject({ runs: 1, known: true })
	})

	it('the lot worktree records are gone and a mutation run file lies inside no mutation run → mutation unknown (a run no event records)', () => {
		const events = [
			...gateFast({ run: 'g1', start: '10:00', end: '10:02' }),
			...stepRun({ run: 'm1', step: 'mutation', start: '10:10', end: '10:20' }),
		]

		expect(
			countSuites(
				paramsOf({
					events,
					goneWorktrees: [LOT_WORKTREE],
					mutationRuns: [{ worktree: LOT_WORKTREE, startedAt: timeOf('11:00') }],
				}),
			).families.mutation,
		).toMatchObject({ runs: null, atLeast: 1, known: false, unknownReason: UNRECORDED })
	})
})
