/**
 * The text of a lot report, one case per line of the report's example (33L0 section 7), each with its full expected
 * text: header, column header, station rows (a `shared` row, `outside stations`, a run still `running` on an open lot,
 * one with `no end` on a terminal lot), agents, time, skills, suites, heavy, review, folders, events, next and the
 * legend lines. Times print as `formatDuration` prints them (`6 m 0 s`, `0.0 s`), tokens as `formatTokens` does.
 * The values come from the pure model on plain inputs; the whole report on disk is in `commands/lot-report.test.ts`.
 */
import { LOT_WORKTREE, THROWAWAY_WORKTREE } from '../../../test/report-events.constants.ts'
import { eventOf, partOf, stationRun, stepRun, timeOf } from '../../../test/report-events.ts'
import { buildLotReport } from './lot-report.ts'
import { renderLotReport } from './render-report.ts'

import { describe, expect, it } from 'vitest'

import type { LotEvent } from './event.types.ts'
import type { LedgerFinding, ReportIdentity } from './lot-report.types.ts'
import type { ReportedLot } from './read-lot-report.types.ts'

type ReportedParams = {
	events: LotEvent[]
	state?: string
	steps?: number
	ledger?: LedgerFinding[]
	roundFolders?: string[]
	questions?: { asked: string; answered: string | null }[]
	closedAt?: string
	damaged?: number
	unknownKinds?: number
	next?: string | null
}

/** The report of the lot `0171-scl-subscribe` (committed unless said, 2 steps) over the events, `next` as given. */
function reportedWith(params: ReportedParams): ReportedLot {
	const identity: ReportIdentity = {
		name: '0171-scl-subscribe',
		state: params.state ?? 'committed',
		feature: 'dataflow-subscribe',
		effort: 'high',
		steps: params.steps ?? 2,
		created: timeOf('10:00'),
		worktree: LOT_WORKTREE,
	}
	return {
		...buildLotReport({
			now: timeOf('12:00'),
			identity,
			transitions: [{ at: timeOf(params.closedAt ?? '10:30'), to: identity.state }],
			questions: params.questions ?? [],
			events: params.events,
			damaged: params.damaged ?? 0,
			unknownKinds: params.unknownKinds ?? 0,
			ledger: params.ledger ?? [],
			roundFolders: params.roundFolders ?? [],
			records: [],
			goneWorktrees: [],
			mutationRuns: [],
		}),
		next: params.next ?? null,
	}
}

/** The arguments of `renderLotReport` for that lot. */
function reportArgs(params: ReportedParams): { report: ReportedLot } {
	return { report: reportedWith(params) }
}

/** The lines that match, one regular expression at a time (a line that matches none is `undefined`). */
function matchedBy(params: { lines: string[]; patterns: RegExp[] }): (string | undefined)[] {
	return params.patterns.map((pattern) => params.lines.find((line) => pattern.test(line)))
}

const LEDGER: LedgerFinding[] = [
	{ round: 1, severity: 'blocking', state: 'fixed' },
	{ round: 1, severity: 'nit', state: 'fixed' },
	{ round: 1, severity: 'nit', state: 'accepted' },
	{ round: 1, severity: 'nit', state: 'gone' },
	{ round: 2, severity: 'blocking', state: 'fixed' },
]

const WORKTREE_CLI = { worktreeCli: { worktreeCli: { version: '0.4.0', stepEvents: true } } }
const LOT_NAME = '0171-scl-subscribe'

/** The stations of a terminal lot: exact, lower bound, two parallel readers, and a reviewer that never ended. */
const STATION_EVENTS: LotEvent[] = [
	...stationRun({
		run: 'tw',
		station: 'test-writer',
		start: '10:00',
		end: '10:06',
		startFields: { step: 1, agent: 'dialecte-test-writer', tier: 'standard', model: 'model-a' },
		endFields: {
			tokens: { total: 182_000 },
			skills: [{ name: 'dialecte-lot', hash: null, how: 'seen' }],
		},
	}),
	...stationRun({
		run: 'im',
		station: 'implementer',
		start: '10:07',
		end: '10:25',
		startFields: { step: 1, agent: 'dialecte-implementer', tier: 'standard', model: 'model-a' },
		endFields: {
			tokens: { input: 300_000, output: 110_000 },
			skills: [
				{ name: 'dialecte-lot', hash: null, how: 'seen' },
				{ name: 'tdd', hash: null, how: 'seen' },
			],
		},
	}),
	...stationRun({
		run: 'ra',
		station: 'reader-a',
		start: '10:40',
		end: '10:50',
		startFields: { step: 2, agent: 'agent-a' },
	}),
	...stationRun({
		run: 'rb',
		station: 'reader-b',
		start: '10:41',
		end: '10:51',
		startFields: { step: 2, agent: 'agent-b' },
	}),
	...stationRun({
		run: 'nd',
		station: 'reviewer',
		start: '10:55',
		end: null,
		startFields: { round: 1, agent: 'dialecte-reviewer', tier: 'strong', model: 'model-a' },
	}),
	...stepRun({ run: 'red', step: 'tdd-red', start: '10:02', end: '10:03', ...WORKTREE_CLI }),
	...stepRun({ run: 'green', step: 'tdd-green', start: '10:10', end: '10:11', ...WORKTREE_CLI }),
	...stepRun({ run: 'f-impl', step: 'gate-fast', start: '10:20', end: '10:21', ...WORKTREE_CLI }),
	...stepRun({ run: 'f-out', step: 'gate-fast', start: '10:30', end: '10:31', ...WORKTREE_CLI }),
	...stepRun({ run: 'f-both', step: 'gate-fast', start: '10:45', end: '10:46', ...WORKTREE_CLI }),
	...stepRun({ run: 'full', step: 'gate-full', start: '11:00', end: '11:04', ...WORKTREE_CLI }),
	...stepRun({ run: 'reh', step: 'rehearsal', start: '11:05', end: '11:07', ...WORKTREE_CLI }),
]

describe('renderLotReport: the header and the column header', () => {
	it('a committed lot of 3 steps and 3 rounds → the header line, the column header line', () => {
		expect(
			((lines) => ({
				header: lines[0],
				columns: lines.find((line) => /^station\s+step\s+round\s+agent/.test(line)),
			}))(
				renderLotReport(
					reportArgs({ events: [], steps: 3, ledger: LEDGER, roundFolders: ['round-3'] }),
				),
			),
		).toEqual({
			header: `lot ${LOT_NAME}  committed · feature dataflow-subscribe · effort high (risk class) · 3 steps · 3 rounds`,
			columns: expect.stringMatching(
				/^station\s+step\s+round\s+agent\s+tier\s+model\s+tokens\s+time\s+suites\s+skills$/,
			),
		})
	})
})

describe('renderLotReport: the station rows', () => {
	it('a terminal lot → one row per station, then shared, outside stations and the run with no end', () => {
		expect(
			matchedBy({
				lines: renderLotReport(reportArgs({ events: STATION_EVENTS, closedAt: '11:30' })),
				patterns: [
					/^test-writer\s+1\s+-\s+dialecte-test-writer\s+standard\s+model-a\s+182k\s+6 m 0 s\s+tdd red 1\s+dialecte-lot$/,
					/^implementer\s+1\s+-\s+dialecte-implementer\s+standard\s+model-a\s+≥ 410k\s+18 m 0 s\s+tdd green 1, fast 1\s+dialecte-lot, tdd$/,
					/^reader-a\s+2\s+-\s+agent-a\s+-\s+-\s+unknown\s+10 m 0 s\s+-\s+-$/,
					/^reader-b\s+2\s+-\s+agent-b\s+-\s+-\s+unknown\s+10 m 0 s\s+-\s+-$/,
					/^shared\s+fast 1$/,
					/^reviewer\s+-\s+1\s+dialecte-reviewer\s+strong\s+model-a\s+unknown\s+no end\s+-\s+-$/,
					/^outside stations\s+fast 1, full 1, rehearsal 1$/,
				],
			}).map((line) => line !== undefined),
		).toEqual([true, true, true, true, true, true, true])
	})

	it('an open lot whose implementer has not ended → its time column says running', () => {
		expect(
			matchedBy({
				lines: renderLotReport(
					reportArgs({
						state: 'working',
						events: stationRun({
							run: 'im',
							station: 'implementer',
							start: '10:07',
							end: null,
							startFields: {
								step: 1,
								agent: 'dialecte-implementer',
								tier: 'standard',
								model: 'model-a',
							},
						}),
					}),
				),
				patterns: [
					/^implementer\s+1\s+-\s+dialecte-implementer\s+standard\s+model-a\s+unknown\s+running\s+-\s+-$/,
				],
			}).map((line) => line !== undefined),
		).toEqual([true])
	})
})

describe('renderLotReport: agents', () => {
	it('an exact station, a lower bound and three that reported nothing → tokens ≥ 592k with 4 of 5 not exact, the parts with their unknown stations, money unknown', () => {
		expect(
			matchedBy({
				lines: renderLotReport(reportArgs({ events: STATION_EVENTS, closedAt: '11:30' })),
				patterns: [/^agents /],
			}),
		).toEqual([
			'agents   5 runs · 5 agents · ≥ 592k tokens (4 of 5 not exact) · in 300k (4 unknown) · out 110k (4 unknown) · money unknown',
		])
	})

	it('no station reported any tokens → tokens unknown, no 0 anywhere on the line', () => {
		expect(
			matchedBy({
				lines: renderLotReport(
					reportArgs({
						events: stationRun({
							run: 'a',
							station: 'reviewer',
							start: '10:00',
							end: '10:05',
							startFields: { agent: 'agent-a' },
						}),
					}),
				),
				patterns: [/^agents /],
			}),
		).toEqual(['agents   1 run · 1 agent · tokens unknown · money unknown'])
	})

	it('R4-5: one of three stations reported money → the sum carries how many stations reported none: money 1.5 EUR (2 of 3 unknown)', () => {
		expect(
			matchedBy({
				lines: renderLotReport(
					reportArgs({
						events: [
							...stationRun({
								run: 'a',
								station: 'reviewer',
								start: '10:00',
								end: '10:05',
								startFields: { agent: 'agent-a' },
								endFields: { money: { amount: 1.5, currency: 'EUR' } },
							}),
							...stationRun({
								run: 'b',
								station: 'reviewer',
								start: '10:10',
								end: '10:15',
								startFields: { agent: 'agent-b' },
							}),
							...stationRun({
								run: 'c',
								station: 'reviewer',
								start: '10:20',
								end: '10:25',
								startFields: { agent: 'agent-c' },
							}),
						],
					}),
				),
				patterns: [/^agents /],
			}),
		).toEqual(['agents   3 runs · 3 agents · tokens unknown · money 1.5 EUR (2 of 3 unknown)'])
	})
})

describe('renderLotReport: time', () => {
	it('two overlapping stations, a gate, a question answered, one wait for the machine → the five categories add up to the elapsed time, agent time apart', () => {
		const events = [
			...stationRun({ run: 'a', station: 'reader-a', start: '10:00', end: '10:10' }),
			...stationRun({ run: 'b', station: 'reader-b', start: '10:05', end: '10:15' }),
			...stepRun({ run: 'g', step: 'gate-fast', start: '10:20', end: '10:23', ...WORKTREE_CLI }),
			eventOf({
				id: 'ev-wait',
				at: timeOf('10:29'),
				kind: 'step.wait',
				by: 'cli',
				step: 'gate-fast',
				waitedMs: 60_000,
			}),
		]

		expect(
			matchedBy({
				lines: renderLotReport(
					reportArgs({
						events,
						questions: [{ asked: timeOf('10:25'), answered: timeOf('10:27') }],
					}),
				),
				patterns: [/^time /],
			}),
		).toEqual([
			'time     30 m 0 s elapsed: agents 15 m 0 s (agent time 20 m 0 s) · cli steps 3 m 0 s · waiting for answers 2 m 0 s · waiting for the machine 1 m 0 s · other 9 m 0 s',
		])
	})

	it('two end-only station runs with no duration → the time line says agent time unknown, not a time of 0', () => {
		const events = [
			...stationRun({ run: 'a', station: 'reader-a', start: null, end: '10:10' }),
			...stationRun({ run: 'b', station: 'reader-b', start: null, end: '10:15' }),
		]

		expect(
			matchedBy({
				lines: renderLotReport(reportArgs({ events })),
				patterns: [/^time /],
			})[0],
		).toMatch(/agent time unknown/)
	})

	it('one end-only run with a duration and one without → the time line gives a lower bound and how many runs are unknown', () => {
		const events = [
			...stationRun({
				run: 'a',
				station: 'reader-a',
				start: null,
				end: '10:10',
				endFields: { duration: 300 },
			}),
			...stationRun({ run: 'b', station: 'reader-b', start: null, end: '10:15' }),
		]

		expect(
			matchedBy({
				lines: renderLotReport(reportArgs({ events })),
				patterns: [/^time /],
			})[0],
		).toMatch(/≥ 5 m 0 s.*agent time.*\(1 of 2 unknown\)|agent time.*≥ 5 m 0 s.*\(1 of 2 unknown\)/)
	})
})

describe('renderLotReport: skills', () => {
	it('skills seen, one asked in a run and seen in another, one asked and never seen → hash, runs that saw, the flag', () => {
		const events = [
			...stationRun({
				run: 'a',
				station: 'reviewer',
				start: '10:00',
				end: '10:10',
				endFields: {
					skills: [
						{ name: 'dialecte-lot', hash: 'a1b2c3d4', how: 'seen' },
						{ name: 'tdd', hash: null, how: 'asked' },
					],
				},
			}),
			...stationRun({
				run: 'b',
				station: 'reviewer',
				start: '10:11',
				end: '10:16',
				endFields: {
					skills: [
						{ name: 'dialecte-lot', hash: 'a1b2c3d4', how: 'seen' },
						{ name: 'tdd', hash: '7e8f9a0b', how: 'seen' },
					],
				},
			}),
			...stationRun({
				run: 'c',
				station: 'implementer',
				start: '10:17',
				end: '10:20',
				endFields: { skills: [{ name: 'extra-skill', hash: null, how: 'asked' }] },
			}),
		]

		expect(
			matchedBy({ lines: renderLotReport(reportArgs({ events })), patterns: [/^skills /] }),
		).toEqual([
			'skills   dialecte-lot a1b2c3d4 (2 seen) · extra-skill (1 asked not seen) · tdd 7e8f9a0b (1 seen)',
		])
	})
})

describe('renderLotReport: suites', () => {
	const FIX = { worktree: THROWAWAY_WORKTREE, throwaway: true, ...WORKTREE_CLI }
	const EVENTS: LotEvent[] = [
		...stepRun({
			run: 'f1',
			step: 'gate-fast',
			start: '10:00',
			end: '10:01',
			endFields: { reuse: 'whole' },
			...WORKTREE_CLI,
		}),
		...stepRun({
			run: 'f2',
			step: 'gate-fast',
			start: '10:02',
			end: '10:03',
			endFields: { reuse: 'partly' },
			...WORKTREE_CLI,
		}),
		...stepRun({
			run: 'f3',
			step: 'gate-fast',
			start: '10:04',
			end: '10:05',
			endFields: { parts: [partOf({ name: 'unit', rerun: true })] },
			...WORKTREE_CLI,
		}),
		...['f4', 'f5', 'f6'].flatMap((run, index) =>
			stepRun({
				run,
				step: 'gate-fast',
				start: `10:1${index}`,
				end: `10:1${index}:30`,
				...WORKTREE_CLI,
			}),
		),
		...['r1', 'r2', 'r3'].flatMap((run, index) =>
			stepRun({
				run,
				step: 'tdd-red',
				start: `10:2${index}`,
				end: `10:2${index}:30`,
				...WORKTREE_CLI,
			}),
		),
		...['g1', 'g2', 'g3'].flatMap((run, index) =>
			stepRun({
				run,
				step: 'tdd-green',
				start: `10:3${index}`,
				end: `10:3${index}:30`,
				...WORKTREE_CLI,
			}),
		),
		...stepRun({ run: 'full', step: 'gate-full', start: '10:40', end: '10:41', ...WORKTREE_CLI }),
		...stepRun({ run: 'reh', step: 'rehearsal', start: '10:42', end: '10:43', ...WORKTREE_CLI }),
		...stepRun({ run: 'old-1', step: 'tdd-red', start: '10:50', end: '10:51', ...FIX }),
		...stepRun({ run: 'old-2', step: 'tdd-red', start: '10:52', end: '10:53', ...FIX }),
		...stationRun({
			run: 'rv',
			station: 'reviewer',
			start: '09:00',
			end: '09:05',
			endFields: { suites: { unit: 6 } },
		}),
	]
	const FIXED: LedgerFinding[] = [
		{ round: 1, severity: 'blocking', state: 'fixed' },
		{ round: 1, severity: 'nit', state: 'fixed' },
		{ round: 2, severity: 'nit', state: 'fixed' },
	]

	it('six fast gates in a lot of 3 steps and 3 rounds, one full, the old-code runs, reuse, a rerun, agent-reported suites → the two suites lines, ! on the count over its limit', () => {
		expect(
			((lines) => lines.slice(lines.findIndex((line) => line.startsWith('suites '))).slice(0, 2))(
				renderLotReport(
					reportArgs({ events: EVENTS, steps: 3, ledger: FIXED, roundFolders: ['round-3'] }),
				),
			),
		).toEqual([
			'suites   gate --fast 6 (limit 5: S+R-1) ! · gate --full 1 (limit 1) · tdd red 3 · tdd green 3 · mutation 0 · rehearsal 1',
			'         reused 1 whole, 1 partly · reruns 1 · fixes on the old code 2 (limit 3) · reported by agents: unit 6',
		])
	})

	it('a run in a worktree whose cli writes no step events → its count is a lower bound with the reason named', () => {
		const events = stepRun({
			run: 'u1',
			step: 'gate-fast',
			start: '10:00',
			end: '10:01',
			worktreeCli: { worktreeCli: { version: '0.3.0', stepEvents: false } },
		})

		expect(
			renderLotReport(reportArgs({ events })).some((line) =>
				line.startsWith("suites   gate --fast ≥ 1 (the worktree's cli writes no step events)"),
			),
		).toBe(true)
	})
})

describe('renderLotReport: heavy, folders, review, events, next', () => {
	const FOLDER_EVENTS: LotEvent[] = [
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

	it('a heavy gate and a heavy part, a cloned worktree, two throwaways, three trashes → the heavy line and the folders line', () => {
		expect(
			matchedBy({
				lines: renderLotReport(reportArgs({ events: FOLDER_EVENTS })),
				patterns: [/^heavy /, /^folders /],
			}),
		).toEqual([
			'heavy    gate --full 3 m 40 s · gate --fast: e2e 2 m 5 s',
			'folders  worktree add 46 s (cloned) · throwaways 2 (12 s) · trash 3',
		])
	})

	it('R4-10: a worktree added with no node_modules to bring → the folders line says (no node_modules), not (none)', () => {
		expect(
			matchedBy({
				lines: renderLotReport(
					reportArgs({
						events: stepRun({
							run: 'w1',
							step: 'worktree-add',
							start: '09:50',
							end: '09:51',
							endFields: { durationMs: 46_000, parts: { nodeModules: 'none', npmCi: false } },
						}),
					}),
				),
				patterns: [/^folders /],
			}),
		).toEqual(['folders  worktree add 46 s (no node_modules)'])
	})

	it('three rounds, two with findings → the review line gives the findings by state, a round without one is approve', () => {
		expect(
			matchedBy({
				lines: renderLotReport(
					reportArgs({ events: [], ledger: LEDGER, roundFolders: ['round-3'] }),
				),
				patterns: [/^review /],
			}),
		).toEqual([
			'review   round 1: 4 findings (2 fixed, 1 accepted, 1 gone) · round 2: 1 (fixed) · round 3: approve',
		])
	})

	it('an end with no start, a repeated end, damaged lines and unknown kinds → the events line', () => {
		const [first, ...rest] = stationRun({
			run: 'a',
			station: 'reviewer',
			start: '10:00',
			end: '10:05',
		})
		const events = [
			first,
			...rest,
			...rest,
			...stationRun({ run: 'b', station: 'reviewer', start: null, end: '10:10' }),
		]

		expect(
			matchedBy({
				lines: renderLotReport(reportArgs({ events, damaged: 2, unknownKinds: 3 })),
				patterns: [/^events /],
			}),
		).toEqual([
			'events   3 · 1 by the host without a start · 1 duplicate · 2 damaged · 3 unknown kinds',
		])
	})

	it('a next command → the next line is exactly it', () => {
		expect(
			matchedBy({
				lines: renderLotReport(
					reportArgs({ events: [], next: 'dialecte lot prune 0171-scl-subscribe' }),
				),
				patterns: [/^next /],
			}),
		).toEqual(['next     dialecte lot prune 0171-scl-subscribe'])
	})
})

describe('renderLotReport: the legend', () => {
	it('the gate-record residual is one line, and the attribution by time another', () => {
		expect(
			((lines) => ({
				residual: lines.some((line) =>
					line.includes(
						"gate counts are at least the events'; an unrecorded earlier run of a mode is not seen",
					),
				),
				attribution: lines.some((line) => /attribut/.test(line) && /by time/.test(line)),
			}))(renderLotReport(reportArgs({ events: [] }))),
		).toEqual({ residual: true, attribution: true })
	})
})
