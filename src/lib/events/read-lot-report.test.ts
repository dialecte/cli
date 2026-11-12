/**
 * The file reads of the lot report (33L0 section 7, "Frozen record times"; case 28 half, 31 `next`): the record times
 * read live while the worktree exists, frozen from the latest `removing` line when it is gone, from the final `card`
 * when there is no such line, gone when there is neither; an unreadable tdd ledger; `next` with the plan command for a
 * terminal lot whose worktree or round folder is on disk. Scratch stores on disk, no git.
 */
import { mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import {
	RECORDING_WORKTREE_CLI,
	REPORT_FEATURE,
	REPORT_NOW,
} from '../../../test/lot-report-workspace.constants.ts'
import {
	appendCardsLog,
	appendLotEvents,
	cardLineOf,
	createRecordedLot,
	frozenRecordsOf,
	makeRoundFolders,
	recordedEvents,
	removalLinesOf,
	writeLedger,
	writeMutationRun,
	writeWorktreeRecords,
} from '../../../test/lot-report-workspace.ts'
import { createStationLot } from '../../../test/lot-station-workspace.ts'
import { stepRun, timeOf } from '../../../test/report-events.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLot } from '../../commands/lot.ts'
import { readLotReport } from './read-lot-report.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../../test/lot-station-workspace.types.ts'
import type { ReportedLot } from './read-lot-report.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const GONE = "the worktree's records are gone"
const NOT_HELD = 'a run no event records'
const UNREADABLE = 'a record could not be read'
/** A committed lot with the recorded events and no worktree on disk: its records live in `cards.log` or nowhere. */
function lotWithoutWorktree(): StationLot {
	const lot = createStationLot({ state: 'committed', feature: REPORT_FEATURE })
	appendLotEvents({ lot, events: recordedEvents({ worktree: lot.worktree }) })
	return lot
}

/** The `gate-fast` row of a lot's report. */
function fastRowOf(report: ReportedLot | undefined) {
	return report?.suites.families['gate-fast']
}

describe(
	'readLotReport: the record times of the lot’s worktree',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the worktree exists, its gate-fast record lies inside the run → live: the count is known (1)', () => {
			const lot = createRecordedLot({ state: 'committed' })

			expect(fastRowOf(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW }))).toMatchObject(
				{ known: true, runs: 1, unknownReason: null },
			)
		})

		it('the worktree exists, its gate-fast record lies in no run → live: the count is unknown, a run no event records', () => {
			const lot = createRecordedLot({ state: 'committed' })
			writeWorktreeRecords({ worktree: lot.worktree, gateFast: timeOf('11:30') })

			expect(fastRowOf(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW }))).toMatchObject(
				{
					known: false,
					runs: null,
					atLeast: 1,
					unknownReason: NOT_HELD,
				},
			)
		})

		it('the worktree is gone, the latest removing line freezes a record in no run → the same unknown, the earlier line ignored', () => {
			const lot = lotWithoutWorktree()
			appendCardsLog({
				registry: lot.workspace.registry,
				lines: [
					...removalLinesOf({
						lot,
						id: 'rm-1',
						at: timeOf('11:00'),
						records: frozenRecordsOf({ gateFast: timeOf('10:20:30') }),
					}),
					...removalLinesOf({
						lot,
						id: 'rm-2',
						at: timeOf('11:30'),
						records: frozenRecordsOf({ gateFast: timeOf('11:30') }),
					}),
				],
			})

			expect(fastRowOf(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW }))).toMatchObject(
				{ known: false, unknownReason: NOT_HELD },
			)
		})

		it('the worktree is gone, the latest removing line freezes a record inside the run → known (1)', () => {
			const lot = lotWithoutWorktree()
			appendCardsLog({
				registry: lot.workspace.registry,
				lines: removalLinesOf({
					lot,
					id: 'rm-1',
					at: timeOf('11:00'),
					records: frozenRecordsOf({ gateFast: timeOf('10:20:30') }),
				}),
			})

			expect(fastRowOf(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW }))).toMatchObject(
				{ known: true, runs: 1 },
			)
		})

		it('the worktree is gone, no removing line, the final card freezes a record in no run → unknown, a run no event records', () => {
			const lot = lotWithoutWorktree()
			appendCardsLog({
				registry: lot.workspace.registry,
				lines: [
					cardLineOf({
						lot: lot.name,
						feature: REPORT_FEATURE,
						at: timeOf('10:50'),
						records: frozenRecordsOf({ gateFast: timeOf('11:30') }),
						repository: lot.workspace.repository,
					}),
				],
			})

			expect(fastRowOf(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW }))).toMatchObject(
				{ known: false, unknownReason: NOT_HELD },
			)
		})

		it('the worktree is gone and no line holds its records → the count is unknown, the worktree’s records are gone', () => {
			const lot = lotWithoutWorktree()

			expect(fastRowOf(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW }))).toMatchObject(
				{
					known: false,
					runs: null,
					atLeast: 1,
					unknownReason: GONE,
				},
			)
		})

		it('R4-5: a gate record that exists but does not parse → gate-fast unknown, a record could not be read (not read as no record), the other families untouched', () => {
			const lot = createRecordedLot({ state: 'committed' })
			writeWorktreeRecords({ worktree: lot.worktree, damagedGateFast: 'not json at all' })

			expect(
				readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.suites.families,
			).toMatchObject({
				'gate-fast': { known: false, runs: null, unknownReason: UNREADABLE },
				'gate-full': { known: true, unknownReason: null },
			})
		})

		it('an unreadable tdd ledger → tdd red and tdd green unknown, a record could not be read', () => {
			const lot = createRecordedLot({ state: 'committed' })
			writeWorktreeRecords({ worktree: lot.worktree, ledger: 'not json at all' })

			expect(
				readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.suites.families,
			).toMatchObject({
				'tdd-red': { known: false, runs: null, unknownReason: UNREADABLE },
				'tdd-green': { known: false, runs: null, unknownReason: UNREADABLE },
			})
		})
	},
)

/** A committed lot whose identity names its worktree through a link, the records and the step events at its real path. */
function lotNamedThroughALink(): StationLot {
	const lot = createStationLot({ state: 'committed', symlinkedWorktree: true })
	writeWorktreeRecords({
		worktree: lot.worktree,
		gateFast: timeOf('10:20:30'),
		gateFull: timeOf('10:41:00'),
		ledger: [
			{ kind: 'red', at: timeOf('10:02:30') },
			{ kind: 'green', at: timeOf('10:10:30') },
		],
	})
	appendLotEvents({ lot, events: recordedEvents({ worktree: realpathSync(lot.worktree) }) })
	return lot
}

describe(
	'readLotReport: a worktree spelled through a link',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the identity names the worktree through a link, the events name its real path, a gate-fast record lies inside the run → known (1), not a run no event records', () => {
			const lot = lotNamedThroughALink()

			expect(fastRowOf(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW }))).toMatchObject(
				{ known: true, runs: 1, unknownReason: null },
			)
		})

		it('the same lot, a mutation run file naming the worktree through the link and a mutation step run around it → mutation known (1)', () => {
			const lot = lotNamedThroughALink()
			writeMutationRun({ lot, startedAt: timeOf('10:30') })
			appendLotEvents({
				lot,
				events: stepRun({
					run: 'step-mutation',
					step: 'mutation',
					start: '10:29',
					end: '10:35',
					worktree: realpathSync(lot.worktree),
					worktreeCli: { worktreeCli: RECORDING_WORKTREE_CLI },
				}),
			})

			expect(
				readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.suites.families.mutation,
			).toMatchObject({ known: true, runs: 1 })
		})
	},
)

describe(
	'readLotReport: the lot of a folder with no identity',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a folder that is no lot → undefined', () => {
			const lot = createStationLot()

			expect(
				readLotReport({ lotFolder: join(lot.workspace.store, 'no-such-lot'), now: REPORT_NOW }),
			).toBeUndefined()
		})
	},
)

describe('readLotReport: next', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a working lot → next is exactly the next of lot status', () => {
		const lot = createStationLot()
		const statusNext = JSON.parse(
			runLot({ cwd: lot.cwd, argv: ['status', lot.name, '--json'] }).output,
		).next

		expect(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.next).toBe(statusNext)
	})

	it('R4-3 (was: lot prune): a committed lot whose worktree folder exists and which has a registry entry → dialecte lot close <registry name>, no --yes', () => {
		const lot = createStationLot({ state: 'committed' })
		mkdirSync(lot.worktree, { recursive: true })

		expect(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.next).toBe(
			`dialecte lot close ${lot.name}`,
		)
	})

	it('R4-3: a canceled lot whose worktree folder exists, with no registry entry → no next (lot close names a hand-over, and lot prune is not there yet)', () => {
		const lot = createStationLot({ state: 'canceled' })
		mkdirSync(lot.worktree, { recursive: true })

		expect(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.next).toBeNull()
	})

	it('R4-3 (was: lot prune): a canceled lot whose worktree is gone but whose <name>-round-1 folder exists → no next', () => {
		const lot = createStationLot({ state: 'canceled' })
		mkdirSync(`${lot.worktree}-round-1`, { recursive: true })

		expect(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.next).toBeNull()
	})

	it('a committed lot with neither its worktree nor a round folder → no next', () => {
		const lot = createStationLot({ state: 'committed' })

		expect(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.next).toBeNull()
	})
})

/** The lot's first review throwaway: `<worktree>-round-1`, and a gate fast run in it from 10:50 to 10:51. */
function addThrowawayRun(lot: StationLot): string {
	const throwaway = `${lot.worktree}-round-1`
	appendLotEvents({
		lot,
		events: stepRun({
			run: 'step-old',
			step: 'gate-fast',
			start: '10:50',
			end: '10:51',
			worktree: throwaway,
			throwaway: true,
			worktreeCli: { worktreeCli: RECORDING_WORKTREE_CLI },
		}),
	})
	return throwaway
}

describe('readLotReport: a review throwaway’s records', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the throwaway exists with a gate-fast record inside its run → read live from its own .git: known (1)', () => {
		const lot = createRecordedLot({ state: 'committed' })
		writeWorktreeRecords({ worktree: addThrowawayRun(lot), gateFast: timeOf('10:50:30') })

		expect(
			readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.suites.throwaways['gate-fast'],
		).toMatchObject({ known: true, runs: 1 })
	})

	it('the throwaway exists with a gate-fast record in no run → unknown, a run no event records', () => {
		const lot = createRecordedLot({ state: 'committed' })
		writeWorktreeRecords({ worktree: addThrowawayRun(lot), gateFast: timeOf('11:30') })

		expect(
			readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.suites.throwaways['gate-fast'],
		).toMatchObject({ known: false, unknownReason: NOT_HELD })
	})

	it('the throwaway is gone, its removing line freezes a record in no run → the same unknown; the lot’s own worktree, gone with no line, stays records gone', () => {
		const lot = lotWithoutWorktree()
		const throwaway = addThrowawayRun(lot)
		appendCardsLog({
			registry: lot.workspace.registry,
			lines: removalLinesOf({
				lot,
				id: 'rm-throwaway',
				at: timeOf('11:00'),
				path: throwaway,
				records: frozenRecordsOf({ gateFast: timeOf('11:30') }),
			}),
		})

		expect(
			((report) => ({
				throwaway: report?.suites.throwaways['gate-fast']?.unknownReason,
				lot: report?.suites.families['gate-fast'].unknownReason,
			}))(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })),
		).toEqual({ throwaway: NOT_HELD, lot: GONE })
	})
})

describe(
	'readLotReport: rounds, findings and mutation runs',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a ledger of three findings in two rounds and the folders round-1 to round-3 → 3 rounds, the findings by severity and state per round, an empty third round', () => {
			const lot = createStationLot({ state: 'committed' })
			writeLedger({
				lot,
				findings: [
					[1, 'blocking', 'fixed 3'],
					[1, 'nit', 'accepted (a reason)'],
					[2, 'blocking', 'open'],
				],
			})
			makeRoundFolders({ lot, rounds: [1, 2, 3] })

			expect(readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })).toMatchObject({
				rounds: 3,
				review: [
					{
						round: 1,
						findings: 2,
						bySeverity: { blocking: 1, nit: 1 },
						byState: { fixed: 1, accepted: 1 },
					},
					{ round: 2, findings: 1, bySeverity: { blocking: 1 }, byState: { open: 1 } },
					{ round: 3, findings: 0 },
				],
			})
		})

		it('a mutation run file of the repository naming the lot’s worktree, no mutation event → mutation unknown, a run no event records', () => {
			const lot = createRecordedLot({ state: 'committed' })
			writeMutationRun({ lot, startedAt: timeOf('10:30') })

			expect(
				readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.suites.families.mutation,
			).toMatchObject({ known: false, unknownReason: NOT_HELD })
		})

		it('the same run file and a mutation step run around it → mutation counted: known (1)', () => {
			const lot = createRecordedLot({ state: 'committed' })
			writeMutationRun({ lot, startedAt: timeOf('10:30') })
			appendLotEvents({
				lot,
				events: stepRun({
					run: 'step-mutation',
					step: 'mutation',
					start: '10:29',
					end: '10:35',
					worktree: lot.worktree,
					worktreeCli: { worktreeCli: RECORDING_WORKTREE_CLI },
				}),
			})

			expect(
				readLotReport({ lotFolder: lot.lotFolder, now: REPORT_NOW })?.suites.families.mutation,
			).toMatchObject({ known: true, runs: 1 })
		})
	},
)
