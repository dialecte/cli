/**
 * `readStationRecords` (33L1 section 4, "The records it reads"; D2, D4-D7, D13): the input of `nextStation` read from a
 * lot folder and its worktree, on hand-written files (events at named seconds of one day, snapshots, a worktree's
 * ledger and gate records). Every case asserts the whole `StationRecords`; the walk's rows are in `next-station.test.ts`.
 */
import { realpathSync as realPathOf, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	appendLotEvents,
	appendRawEventLines,
	makeRoundFolders,
} from '../../../test/lot-report-workspace.ts'
import { snapshotOf } from '../../../test/lot-start-workspace.ts'
import { commitStationLot, createStationLot } from '../../../test/lot-station-workspace.ts'
import { stationRun } from '../../../test/report-events.ts'
import {
	CONSUMER_PACKAGE,
	DECISION_DAY,
	PRODUCER_PACKAGE,
} from '../../../test/station-records-workspace.constants.ts'
import {
	checkMove,
	clockOf,
	makeWorktree,
	rewriteRecord,
	setIdentityEffort,
	stationMove,
	timeAtSecond,
	writeGateRecord,
	writeLotBrief,
	writeSnapshot,
	writeTddLedger,
	writeWorktreePackage,
} from '../../../test/station-records-workspace.ts'
import { entryOf, questionTransitionOf, writeRecordFile } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import { appendDecision } from '../review-rounds/decisions-file.ts'
import { readLotStateInput, registryOfLotFolder } from './lot-records.ts'
import { readBeyondCapRows, readStationRecords } from './station-records.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../../test/lot-station-workspace.types.ts'
import type {
	CheckName,
	StationRecords,
	StationVerdict,
	TimelineEntry,
} from './next-station.types.ts'
import type { BeyondCapRow } from './station-records.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** What a lot with no event, no worktree and no brief change reads as: the identity's effort is `medium`, the brief has one step. */
const BASE: StationRecords = {
	state: 'working',
	openQuestion: null,
	steps: 1,
	effort: 'medium',
	producer: false,
	registered: false,
	checks: 'events',
	worktreeRecords: false,
	beyondCap: [],
	timeline: [],
}

type Case = {
	title: string
	build: (lot: StationLot) => void
	expected: Partial<StationRecords>
}

/** The input of `lotState` for the lot, read the way `lot status` reads it. */
function inputOf(lot: StationLot) {
	const lotFolder = realPathOf(lot.lotFolder)
	const registry = registryOfLotFolder(lotFolder)
	const input = readLotStateInput({ lotFolder, registry, entries: readStoreEntries(registry) })
	if (input === undefined) throw new Error('the lot of the case does not read')
	return { lotFolder, input }
}

function startOf(params: {
	run: string
	station: string
	second: number
	step?: number
	round?: number
}): TimelineEntry {
	const { second, ...rest } = params

	return { kind: 'station.start', ...rest, at: timeAtSecond(second) }
}

function endOf(params: {
	run: string
	station: string
	step?: number
	round?: number
	verdict?: StationVerdict
	exit?: number
	stateHash?: string
}): TimelineEntry {
	return { kind: 'station.end', ...params }
}

function checkOf(params: {
	check: CheckName
	passed: boolean
	throwaway?: boolean
	stateHash?: string
}): TimelineEntry {
	return {
		kind: 'check',
		check: params.check,
		passed: params.passed,
		throwaway: params.throwaway ?? false,
		...(params.stateHash === undefined ? {} : { stateHash: params.stateHash }),
	}
}

const EVENT_CASES: Case[] = [
	{
		title: 'no event, no worktree, the brief of one step -> the empty records',
		build: () => undefined,
		expected: {},
	},
	{
		title:
			'station events: each start and end in order with step, round, verdict and exit; an open start kept; a retry (a second end line of one run) once; an unknown station name as it is',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: [
					...stationMove({ lot, station: 'test-writer', step: 1, start: 1, end: 2, exit: 0 }),
					...stationMove({
						lot,
						station: 'test-reviewer',
						step: 1,
						start: 3,
						end: 4,
						verdict: 'approve',
					}),
					...stationMove({
						lot,
						station: 'reviewer',
						round: 1,
						start: 5,
						end: 6,
						verdict: 'fix-then-repass',
					}),
					...stationMove({ lot, station: 'implementer', step: 1, start: 7, end: null }),
					...stationMove({ lot, station: 'scribe', start: 8, end: 9 }),
				],
			})
			// the retry: the end of the first run written again
			appendRawEventLines({
				lot,
				lines: [
					JSON.stringify(
						stationMove({ lot, station: 'test-writer', step: 1, start: 1, end: 2, exit: 0 })[1],
					),
				],
			})
		},
		expected: {
			timeline: [
				startOf({ run: 'run-test-writer-1', station: 'test-writer', second: 1, step: 1 }),
				endOf({ run: 'run-test-writer-1', station: 'test-writer', step: 1, exit: 0 }),
				startOf({ run: 'run-test-reviewer-3', station: 'test-reviewer', second: 3, step: 1 }),
				endOf({
					run: 'run-test-reviewer-3',
					station: 'test-reviewer',
					step: 1,
					verdict: 'approve',
				}),
				startOf({ run: 'run-reviewer-5', station: 'reviewer', second: 5, round: 1 }),
				endOf({
					run: 'run-reviewer-5',
					station: 'reviewer',
					round: 1,
					verdict: 'fix-then-repass',
				}),
				startOf({ run: 'run-implementer-7', station: 'implementer', second: 7, step: 1 }),
				startOf({ run: 'run-scribe-8', station: 'scribe', second: 8 }),
				endOf({ run: 'run-scribe-8', station: 'scribe' }),
			],
		},
	},
	{
		title:
			'D32 (R4-1): an end that names its run only takes the step of its start; a round station takes its round; an end whose run pairs with no start stays as written (no position)',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: [
					...stationMove({
						lot,
						station: 'test-writer',
						step: 2,
						start: 1,
						end: 2,
						endWithoutPosition: true,
					}),
					...stationMove({
						lot,
						station: 'reviewer',
						round: 1,
						start: 3,
						end: 4,
						endWithoutPosition: true,
					}),
					...stationRun({
						run: 'run-lonely',
						station: 'test-reviewer',
						start: null,
						end: clockOf(5),
						startFields: {},
						endFields: {},
					}),
				],
			})
		},
		expected: {
			timeline: [
				startOf({ run: 'run-test-writer-1', station: 'test-writer', second: 1, step: 2 }),
				endOf({ run: 'run-test-writer-1', station: 'test-writer', step: 2 }),
				startOf({ run: 'run-reviewer-3', station: 'reviewer', second: 3, round: 1 }),
				endOf({ run: 'run-reviewer-3', station: 'reviewer', round: 1 }),
				endOf({ run: 'run-lonely', station: 'test-reviewer' }),
			],
		},
	},
	{
		title:
			'cli step ends: the five checks with passed = exit 0; a non-zero exit and an interrupted end are not passed; a throwaway keeps its flag; gate-release, gate-hook, mutation and worktree-add are no check; a step of another worktree is no check; step.start lines are no entry',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: [
					...checkMove({ lot, check: 'tdd-red', start: 1, end: 2 }),
					...checkMove({ lot, check: 'tdd-green', exit: 1, start: 3, end: 4 }),
					...checkMove({ lot, check: 'gate-fast', start: 5, end: 6 }),
					...checkMove({ lot, check: 'gate-full', interrupted: true, start: 7, end: 8 }),
					...checkMove({ lot, check: 'contrib', start: 9, end: 10 }),
					...checkMove({ lot, check: 'gate-release', start: 11, end: 12 }),
					...checkMove({ lot, check: 'gate-hook', start: 13, end: 14 }),
					...checkMove({ lot, check: 'mutation', start: 15, end: 16 }),
					...checkMove({ lot, check: 'gate-fast', throwaway: true, start: 17, end: 18 }),
					...checkMove({ lot, check: 'worktree-add', start: 19, end: 20 }),
					// a step of another worktree than the lot's is never a check (D21.2)
					...checkMove({
						lot,
						check: 'gate-full',
						worktree: join(lot.workspace.workspace, '.worktrees', 'another-lot'),
						start: 21,
						end: 22,
					}),
				],
			})
		},
		expected: {
			timeline: [
				checkOf({ check: 'tdd-red', passed: true }),
				checkOf({ check: 'tdd-green', passed: false }),
				checkOf({ check: 'gate-fast', passed: true }),
				checkOf({ check: 'gate-full', passed: false }),
				checkOf({ check: 'contrib', passed: true }),
				checkOf({ check: 'gate-fast', passed: true, throwaway: true }),
			],
		},
	},
	{
		title:
			'D29: the end of a station and the step ends of a check carry their stateHash into the timeline; an event with none carries none',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: [
					...stationMove({
						lot,
						station: 'test-writer',
						step: 1,
						start: 1,
						end: 6,
						stateHash: 'hash-1',
					}),
					...checkMove({ lot, check: 'tdd-red', start: 2, end: 3, stateHash: 'hash-1' }),
					...checkMove({ lot, check: 'tdd-green', start: 4, end: 5 }),
				],
			})
		},
		expected: {
			timeline: [
				startOf({ run: 'run-test-writer-1', station: 'test-writer', second: 1, step: 1 }),
				checkOf({ check: 'tdd-red', passed: true, stateHash: 'hash-1' }),
				checkOf({ check: 'tdd-green', passed: true }),
				endOf({ run: 'run-test-writer-1', station: 'test-writer', step: 1, stateHash: 'hash-1' }),
			],
		},
	},
	{
		title: 'a damaged line and a torn last line in events.jsonl are skipped; the valid events stay',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: stationMove({ lot, station: 'test-writer', step: 1, start: 1, end: 2 }),
			})
			appendRawEventLines({ lot, lines: ['{not json'] })
			writeFileSync(lot.eventsFile, '{"torn":', { flag: 'a' })
		},
		expected: {
			timeline: [
				startOf({ run: 'run-test-writer-1', station: 'test-writer', second: 1, step: 1 }),
				endOf({ run: 'run-test-writer-1', station: 'test-writer', step: 1 }),
			],
		},
	},
]

const SNAPSHOT_CASES: Case[] = [
	{
		title:
			'snapshots are placed by the `at` of round-<n>.state, else by the mtime of round-<n>.base (the state wins over a later mtime)',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: [
					...stationMove({ lot, station: 'test-writer', step: 1, start: 1, end: 2 }),
					...stationMove({ lot, station: 'test-reviewer', step: 1, start: 11, end: 12 }),
					...stationMove({ lot, station: 'reviewer', round: 1, start: 21, end: 22 }),
					...stationMove({ lot, station: 'reviewer', round: 2, start: 41, end: 42 }),
				],
			})
			// round 1: the state at 10, after the test-writer end; round 2: the state at 30, its base is much later;
			// round 3: no state, the base's mtime at 60, after every event
			writeSnapshot({ lot, round: 1, state: 10 })
			writeSnapshot({ lot, round: 2, state: 30, baseSecond: 50 })
			writeSnapshot({ lot, round: 3, baseSecond: 60 })
		},
		expected: {
			timeline: [
				startOf({ run: 'run-test-writer-1', station: 'test-writer', second: 1, step: 1 }),
				endOf({ run: 'run-test-writer-1', station: 'test-writer', step: 1 }),
				{ kind: 'snapshot', round: 1 },
				startOf({ run: 'run-test-reviewer-11', station: 'test-reviewer', second: 11, step: 1 }),
				endOf({ run: 'run-test-reviewer-11', station: 'test-reviewer', step: 1 }),
				startOf({ run: 'run-reviewer-21', station: 'reviewer', second: 21, round: 1 }),
				endOf({ run: 'run-reviewer-21', station: 'reviewer', round: 1 }),
				{ kind: 'snapshot', round: 2 },
				startOf({ run: 'run-reviewer-41', station: 'reviewer', second: 41, round: 2 }),
				endOf({ run: 'run-reviewer-41', station: 'reviewer', round: 2 }),
				{ kind: 'snapshot', round: 3 },
			],
		},
	},
	{
		title:
			'a round folder with no .state and no .base mtime read is still a snapshot (folders only)',
		build: (lot) => {
			makeRoundFolders({ lot, rounds: [1] })
		},
		expected: { timeline: [{ kind: 'snapshot', round: 1 }] },
	},
]

const RECORD_CASES: Case[] = [
	{
		title:
			'the worktree cli writes no step events (one event says so): tdd ledger entries and gate records join the timeline by their time, green per mode',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: [
					// the first event carries stepEvents false, the second does not: some event is enough
					...stationMove({
						lot,
						station: 'test-writer',
						step: 1,
						start: 1,
						end: 2,
						noStepEvents: true,
					}),
					...stationMove({ lot, station: 'implementer', step: 1, start: 10, end: 11 }),
				],
			})
			writeTddLedger({
				lot,
				entries: [
					{ kind: 'red', second: 3 },
					{ kind: 'freeze', second: 4 },
					{ kind: 'green', second: 6 },
				],
			})
			writeGateRecord({ lot, mode: 'full', second: 8, passed: false })
			writeGateRecord({ lot, mode: 'contrib', second: 9 })
			writeGateRecord({ lot, mode: 'fast', second: 12 })
		},
		expected: {
			checks: 'records',
			worktreeRecords: true,
			timeline: [
				startOf({ run: 'run-test-writer-1', station: 'test-writer', second: 1, step: 1 }),
				endOf({ run: 'run-test-writer-1', station: 'test-writer', step: 1 }),
				checkOf({ check: 'tdd-red', passed: true }),
				checkOf({ check: 'tdd-red', passed: true }),
				checkOf({ check: 'tdd-green', passed: true }),
				checkOf({ check: 'gate-full', passed: false }),
				checkOf({ check: 'contrib', passed: true }),
				startOf({ run: 'run-implementer-10', station: 'implementer', second: 10, step: 1 }),
				endOf({ run: 'run-implementer-10', station: 'implementer', step: 1 }),
				checkOf({ check: 'gate-fast', passed: true }),
			],
		},
	},
	{
		title:
			'a record whose time equals an event end is not after it: it is placed before that end (D4: a claim stays unchecked)',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: stationMove({
					lot,
					station: 'implementer',
					step: 1,
					start: 5,
					end: 6,
					noStepEvents: true,
				}),
			})
			writeGateRecord({ lot, mode: 'fast', second: 6 })
		},
		expected: {
			checks: 'records',
			worktreeRecords: true,
			timeline: [
				startOf({ run: 'run-implementer-5', station: 'implementer', second: 5, step: 1 }),
				checkOf({ check: 'gate-fast', passed: true }),
				endOf({ run: 'run-implementer-5', station: 'implementer', step: 1 }),
			],
		},
	},
	{
		title:
			'events that carry stepEvents true: the worktree holds a ledger and a gate record, they are not read into the timeline, but worktreeRecords is true',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: stationMove({ lot, station: 'test-writer', step: 1, start: 1, end: 2 }),
			})
			writeTddLedger({ lot, entries: [{ kind: 'red', second: 3 }] })
			writeGateRecord({ lot, mode: 'fast', second: 4 })
		},
		expected: {
			checks: 'events',
			worktreeRecords: true,
			timeline: [
				startOf({ run: 'run-test-writer-1', station: 'test-writer', second: 1, step: 1 }),
				endOf({ run: 'run-test-writer-1', station: 'test-writer', step: 1 }),
			],
		},
	},
	{
		title:
			'records mode: a gate record whose steps are passed, skipped and not-run, none failed, is green (D20.7)',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: stationMove({
					lot,
					station: 'implementer',
					step: 1,
					start: 1,
					end: 2,
					noStepEvents: true,
				}),
			})
			writeGateRecord({ lot, mode: 'fast', second: 3, statuses: ['passed', 'skipped', 'not-run'] })
		},
		expected: {
			checks: 'records',
			worktreeRecords: true,
			timeline: [
				startOf({ run: 'run-implementer-1', station: 'implementer', second: 1, step: 1 }),
				endOf({ run: 'run-implementer-1', station: 'implementer', step: 1 }),
				checkOf({ check: 'gate-fast', passed: true }),
			],
		},
	},
	{
		title:
			'events mode (D21.1): an exit-0 gate-fast event then a newer FAILED gate-fast record puts a passed:false check after it; a failed contrib record is added too; a passed gate-full record and the tdd ledger stay out',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: [
					...stationMove({ lot, station: 'implementer', step: 1, start: 1, end: 2 }),
					...checkMove({ lot, check: 'gate-fast', start: 3, end: 4 }),
				],
			})
			writeGateRecord({ lot, mode: 'fast', second: 6, passed: false })
			writeGateRecord({ lot, mode: 'full', second: 7 })
			writeGateRecord({ lot, mode: 'contrib', second: 8, passed: false })
			writeTddLedger({ lot, entries: [{ kind: 'green', second: 9 }] })
		},
		expected: {
			checks: 'events',
			worktreeRecords: true,
			timeline: [
				startOf({ run: 'run-implementer-1', station: 'implementer', second: 1, step: 1 }),
				endOf({ run: 'run-implementer-1', station: 'implementer', step: 1 }),
				checkOf({ check: 'gate-fast', passed: true }),
				checkOf({ check: 'gate-fast', passed: false }),
				checkOf({ check: 'contrib', passed: false }),
			],
		},
	},
	{
		title: 'a ledger entry with no event at all: worktreeRecords true, the timeline empty (case 7)',
		build: (lot) => {
			writeTddLedger({ lot, entries: [{ kind: 'red', second: 3 }] })
		},
		expected: { checks: 'events', worktreeRecords: true, timeline: [] },
	},
	{
		title:
			'stepEvents false and the worktree gone: checks none, worktreeRecords false (case 11: neither readable)',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: stationMove({
					lot,
					station: 'test-writer',
					step: 1,
					start: 1,
					end: 2,
					noStepEvents: true,
				}),
			})
		},
		expected: {
			checks: 'none',
			worktreeRecords: false,
			timeline: [
				startOf({ run: 'run-test-writer-1', station: 'test-writer', second: 1, step: 1 }),
				endOf({ run: 'run-test-writer-1', station: 'test-writer', step: 1 }),
			],
		},
	},
	{
		title:
			'stepEvents false and the worktree readable but holding no ledger and no gate record: checks records, worktreeRecords false',
		build: (lot) => {
			appendLotEvents({
				lot,
				events: stationMove({
					lot,
					station: 'test-writer',
					step: 1,
					start: 1,
					end: 2,
					noStepEvents: true,
				}),
			})
			makeWorktree(lot)
		},
		expected: {
			checks: 'records',
			worktreeRecords: false,
			timeline: [
				startOf({ run: 'run-test-writer-1', station: 'test-writer', second: 1, step: 1 }),
				endOf({ run: 'run-test-writer-1', station: 'test-writer', step: 1 }),
			],
		},
	},
]

const BRIEF_CASES: Case[] = [
	{
		title: 'steps: the brief holds three steps -> 3',
		build: (lot) => writeLotBrief({ lot, stepCount: 3 }),
		expected: { steps: 3 },
	},
	{
		title: 'steps: a brief whose steps array is empty -> 1 (D20.8)',
		build: (lot) => writeLotBrief({ lot, stepCount: 0 }),
		expected: { steps: 1 },
	},
	{
		title: 'steps: no brief.json -> 1, never a throw (D13)',
		build: (lot) => {
			renameSync(join(lot.lotFolder, 'brief.json'), join(lot.lotFolder, 'brief.json.moved'))
		},
		expected: { steps: 1 },
	},
	{
		title: 'steps: a brief.json that does not parse -> 1 (D13)',
		build: (lot) => {
			rewriteRecord({ path: join(lot.lotFolder, 'brief.json'), text: '{ not json' })
		},
		expected: { steps: 1 },
	},
	{
		title: 'effort (D2): the identity holds none, the folder brief says high -> high',
		build: (lot) => {
			setIdentityEffort({ lot, level: undefined })
			writeLotBrief({ lot, stepCount: 1, effort: 'high' })
		},
		expected: { effort: 'high' },
	},
	{
		title: 'effort (D2): the identity says low, the brief says high -> low (the identity first)',
		build: (lot) => {
			setIdentityEffort({ lot, level: 'low' })
			writeLotBrief({ lot, stepCount: 1, effort: 'high' })
		},
		expected: { effort: 'low' },
	},
	{
		title: 'effort (D2): neither the identity nor the brief says -> undefined',
		build: (lot) => {
			setIdentityEffort({ lot, level: undefined })
			writeLotBrief({ lot, stepCount: 1 })
		},
		expected: { effort: undefined },
	},
	{
		title:
			'effort (D2): the identity holds none and the brief does not parse -> undefined, no throw',
		build: (lot) => {
			setIdentityEffort({ lot, level: undefined })
			rewriteRecord({ path: join(lot.lotFolder, 'brief.json'), text: '{ not json' })
		},
		expected: { effort: undefined, steps: 1 },
	},
]

const DECISION_CASES: Case[] = [
	{
		title:
			'beyondCap: the rounds of the decisions rows that start with "round <n> beyond the cap", in file order; any other row is ignored',
		build: (lot) => {
			const path = join(lot.lotFolder, 'decisions.md')
			for (const decision of [
				'round 3 beyond the cap of 2: a third pass is needed',
				'the names stay as they are',
				'round 4 beyond the cap of 2: one more pass',
				'rounds 6 beyond the cap of 2: not a go-ahead row',
			])
				appendDecision({ path, title: lot.name, decision, by: 'person-a', when: DECISION_DAY })
		},
		expected: { beyondCap: [3, 4] },
	},
	{
		title: 'beyondCap: no decisions.md -> none',
		build: () => undefined,
		expected: { beyondCap: [] },
	},
]

const PROFILE_CASES: Case[] = [
	{
		title: 'producer: the worktree package.json declares dialecte.profile contributor -> true',
		build: (lot) => writeWorktreePackage({ lot, manifest: PRODUCER_PACKAGE }),
		expected: { producer: true },
	},
	{
		title: 'producer: the profile is consumer -> false',
		build: (lot) => writeWorktreePackage({ lot, manifest: CONSUMER_PACKAGE }),
		expected: { producer: false },
	},
	{
		title: 'producer: no package.json in the worktree (it does not exist) -> false, no throw',
		build: () => undefined,
		expected: { producer: false },
	},
]

const STATE_CASES: Case[] = [
	{
		title: 'registered and state: a committed registry entry names the lot folder',
		build: (lot) => commitStationLot(lot),
		expected: { registered: true, state: 'committed' },
	},
	{
		title: 'registered and state: a pending entry -> registered, ready',
		build: (lot) => {
			writeRecordFile({
				folder: lot.workspace.registry,
				name: `${lot.name}.json`,
				text: JSON.stringify({
					...entryOf({ state: 'pending', folder: lot.lotFolder }),
					name: lot.name,
				}),
			})
		},
		expected: { registered: true, state: 'ready' },
	},
	{
		title: 'state and openQuestion: an open question transition -> input-required, q1',
		build: (lot) => {
			writeRecordFile({
				folder: lot.lotFolder,
				name: 'transitions/000002.json',
				text: `${JSON.stringify({ ...questionTransitionOf({ seq: 2, number: 1 }), simulated: false })}\n`,
			})
		},
		expected: { state: 'input-required', openQuestion: 'q1' },
	},
]

const GROUPS: { name: string; cases: Case[] }[] = [
	{ name: 'events', cases: EVENT_CASES },
	{ name: 'snapshots', cases: SNAPSHOT_CASES },
	{ name: 'worktree records and checks', cases: RECORD_CASES },
	{ name: 'brief and effort', cases: BRIEF_CASES },
	{ name: 'decisions', cases: DECISION_CASES },
	{ name: 'producer', cases: PROFILE_CASES },
	{ name: 'registry and state', cases: STATE_CASES },
]

describe('readStationRecords', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const group of GROUPS)
		describe(group.name, () => {
			for (const row of group.cases)
				it(row.title, () => {
					const lot = createStationLot()
					row.build(lot)
					const { lotFolder, input } = inputOf(lot)

					expect(readStationRecords({ lotFolder, input })).toEqual({ ...BASE, ...row.expected })
				})
		})

	it('reads files only: the lot folder and the worktree are byte-identical after a read', () => {
		const lot = createStationLot()
		writeLotBrief({ lot, stepCount: 2 })
		appendLotEvents({
			lot,
			events: stationMove({
				lot,
				station: 'test-writer',
				step: 1,
				start: 1,
				end: 2,
				noStepEvents: true,
			}),
		})
		writeSnapshot({ lot, round: 1, state: 3 })
		writeTddLedger({ lot, entries: [{ kind: 'red', second: 4 }] })
		writeGateRecord({ lot, mode: 'fast', second: 5 })
		const { lotFolder, input } = inputOf(lot)
		const folders = [lotFolder, realPathOf(lot.worktree)]
		const before = folders.map(snapshotOf)

		expect(readStationRecords({ lotFolder, input })).toMatchObject({ steps: 2, checks: 'records' })
		expect(folders.map(snapshotOf)).toEqual(before)
	})
})

describe('readBeyondCapRows', { timeout: STORE_CASE_TIMEOUT }, () => {
	const CASES: { title: string; decision: string; by: string; rows: BeyondCapRow[] }[] = [
		{
			title: 'a reason holding a colon and an escaped pipe -> read back whole',
			decision: 'round 4 beyond the cap of 3: a: b | c',
			by: 'person-a',
			rows: [{ round: 4, by: 'person-a', reason: 'a: b | c' }],
		},
		{
			title: 'a decision that only mentions the phrase mid-sentence -> not a row',
			decision: 'we noted that round 4 beyond the cap of 3 is rare',
			by: 'person-a',
			rows: [],
		},
	]

	for (const { title, decision, by, rows } of CASES)
		it(title, () => {
			const lot = createStationLot()
			appendDecision({
				path: join(lot.lotFolder, 'decisions.md'),
				title: lot.name,
				decision,
				by,
				when: DECISION_DAY,
			})

			expect(readBeyondCapRows({ lotFolder: lot.lotFolder })).toEqual(rows)
		})
})
