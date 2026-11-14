/**
 * The records `nextStation` walks, read from a lot folder and its worktree (33L1 section 4, "The records it reads").
 * Files only: no git, no process; a missing or unreadable record never throws.
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { pairRuns } from '../events/pair-runs.ts'
import { readEvents } from '../events/read-events.ts'
import { readGateRecordResult, readRecordTimes } from '../events/record-times.ts'
import { STATION_VERDICTS } from '../events/station-event.constants.ts'
import { GATE_RECORD_FAMILIES } from '../events/unrecorded-steps.constants.ts'
import { realPathOf } from '../file-system.ts'
import { readProfile } from '../profile/profile.ts'
import { readDecisions } from '../review-rounds/decisions-file.ts'
import { DECISIONS_FILE } from '../review-rounds/review-rounds.constants.ts'
import { roundNames, snapshotRounds } from '../review-rounds/round-names.ts'
import { interimEffortOf, readBriefStepCount } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { nextStation } from './next-station.ts'
import {
	BEYOND_CAP_PATTERN,
	CHECK_STEPS,
	EVENT_RANK,
	RECORD_CHECKS,
	RECORD_RANK,
} from './station-records.constants.ts'
import { STORE_FILES } from './store.constants.ts'

import type { EventRun, LotEvent } from '../events/event.types.ts'
import type { RecordTimesRead } from '../events/record-times.types.ts'
import type { TddEntryTime } from '../events/unrecorded-steps.types.ts'
import type { CheckName, StationRecords, TimelineEntry } from './next-station.types.ts'
import type { BeyondCapRow, RunPosition, TimedEntry } from './station-records.types.ts'
import type { LotStateInput, StationNext } from './store.types.ts'

/**
 * The records `nextStation` walks, read from a lot folder and its worktree (33L1 section 4, "The records it
 * reads"): events through `readEvents` and `pairRuns`, the round snapshots, and, when the worktree's cli writes no
 * step events, the worktree's tdd ledger and gate records. Files only: no git, no process; a missing or unreadable
 * record never throws.
 */
export function readStationRecords(params: {
	lotFolder: string
	input: LotStateInput
}): StationRecords {
	const { lotFolder, input } = params
	const { identity } = input
	const report = lotState(input)
	const { events, runs } = pairRuns({
		events: readEvents({ file: join(lotFolder, STORE_FILES.events) }).events,
	})
	const starts = startsByRun({ runs })
	const records =
		identity.worktree === null ? undefined : readRecordTimes({ worktree: identity.worktree })
	const checks = checksOf({ events, records })
	return {
		state: report.state,
		openQuestion: report.openQuestions[0]?.id ?? null,
		steps: readBriefStepCount({ lotFolder }),
		effort: interimEffortOf({ lotFolder, identityEffort: identity.effort }),
		producer: isProducer({ worktree: identity.worktree }),
		registered: input.registryEntry !== undefined && input.registryEntry !== null,
		checks,
		worktreeRecords: holdsRecords({ records }),
		beyondCap: readBeyondCapRows({ lotFolder }).map((row) => row.round),
		timeline: timelineOf({
			lotFolder,
			events,
			starts,
			worktree: identity.worktree,
			records,
			checks,
		}),
	}
}

/** The start event of each paired run, by run (an end of that run takes its position, D32). */
function startsByRun(params: { runs: readonly EventRun[] }): Map<string, LotEvent> {
	const starts = new Map<string, LotEvent>()
	for (const { run, start } of params.runs) if (start !== undefined) starts.set(run, start)
	return starts
}

/**
 * The next station of a lot: the walk over `readStationRecords`, with the run of a running station (the open start
 * no later station event or snapshot follows, checks aside, D32); null for a simulated lot (33L1 section 4). One read
 * for `lot status` and `lot report`.
 */
export function readStationNext(params: {
	lotFolder: string
	input: LotStateInput
}): StationNext | null {
	if (params.input.identity.simulated) return null
	const records = readStationRecords(params)
	const next = nextStation(records)
	const last = records.timeline.filter((entry) => entry.kind !== 'check').at(-1)
	return {
		next,
		run: next.kind === 'running' && last?.kind === 'station.start' ? last.run : null,
	}
}

/**
 * The go-ahead rows of the lot's `decisions.md` for review rounds above the cap, in file order: the rows whose
 * decision starts with `round <n> beyond the cap` (33L1 section 6); none without the file.
 */
export function readBeyondCapRows(params: { lotFolder: string }): BeyondCapRow[] {
	return readDecisions(join(params.lotFolder, DECISIONS_FILE)).flatMap(function beyondCapOf(row) {
		const match = BEYOND_CAP_PATTERN.exec(row.decision)
		return match ? [{ round: Number(match[1]), by: row.by, reason: match[2] ?? '' }] : []
	})
}

/**
 * Where the checks come from: the step events, unless some event says the worktree's cli writes none (the rule of
 * `unrecorded-steps.ts`); then the worktree's records when they read, else none.
 */
function checksOf(params: {
	events: readonly LotEvent[]
	records: RecordTimesRead | undefined
}): StationRecords['checks'] {
	if (writesStepEvents({ events: params.events })) return 'events'
	return params.records !== undefined && !params.records.gone ? 'records' : 'none'
}

/**
 * Whether the lot's worktree cli writes step events: false when some event says it does not (the rule of
 * `unrecorded-steps.ts`). One rule for the walk and the card's review line.
 */
export function writesStepEvents(params: { events: readonly LotEvent[] }): boolean {
	return !params.events.some((event) => event.worktreeCli?.stepEvents === false)
}

/** Whether the worktree holds a tdd ledger (read or not) or a gate record. */
function holdsRecords(params: { records: RecordTimesRead | undefined }): boolean {
	const { records } = params
	if (records === undefined || records.gone) return false
	const { times } = records
	return (
		times.tdd === null ||
		times.tdd.length > 0 ||
		(times.unreadableGates?.length ?? 0) > 0 ||
		GATE_RECORD_FAMILIES.some(({ field }) => times[field] !== null)
	)
}

/** Whether the worktree's package declares the producer profile; false without a worktree or a readable one. */
function isProducer(params: { worktree: string | null }): boolean {
	if (params.worktree === null) return false
	try {
		return readProfile(params.worktree) === 'contributor'
	} catch {
		return false
	}
}

/**
 * One sequence (33L1 D4): the events in `readEvents` order, the snapshots and the worktree records placed by their
 * time; an entry of the same time as an event goes before it (a tie is not after), one of no known time last.
 */
function timelineOf(params: {
	lotFolder: string
	events: readonly LotEvent[]
	starts: ReadonlyMap<string, LotEvent>
	worktree: string | null
	records: RecordTimesRead | undefined
	checks: StationRecords['checks']
}): TimelineEntry[] {
	const timed: TimedEntry[] = [
		...eventEntries({ events: params.events, starts: params.starts, worktree: params.worktree }),
		...snapshotEntries({ lotFolder: params.lotFolder }),
		...recordEntries(params),
	]
	// a stable sort: entries of one time and rank keep the order they were read in
	return timed.sort(byTimeAndRank).map((timedEntry) => timedEntry.entry)
}

/** The station starts and ends, and the check ends of the lot's own worktree, as timeline entries. */
function eventEntries(params: {
	events: readonly LotEvent[]
	starts: ReadonlyMap<string, LotEvent>
	worktree: string | null
}): TimedEntry[] {
	const worktree = params.worktree === null ? undefined : realPathOf(params.worktree)
	const { starts } = params
	return params.events.flatMap(function entryOfEvent(event) {
		const entry = timelineEntryOf({ event, starts, worktree })
		return entry === undefined ? [] : [{ at: event.at, rank: EVENT_RANK, entry }]
	})
}

/** The timeline entry of an event; undefined for a kind the walk does not read. */
function timelineEntryOf(params: {
	event: LotEvent
	starts: ReadonlyMap<string, LotEvent>
	worktree: string | undefined
}): TimelineEntry | undefined {
	const { event } = params
	if (event.kind === 'station.start' || event.kind === 'station.end')
		return stationEntryOf({ event, starts: params.starts })
	if (event.kind !== 'step.end') return undefined
	const check = CHECK_STEPS.find((step) => step === event.step)
	if (check === undefined) return undefined
	if (typeof event.worktree !== 'string' || realPathOf(event.worktree) !== params.worktree)
		return undefined
	return {
		kind: 'check',
		check,
		passed: event.exit === 0,
		throwaway: event.throwaway === true,
		...stateHashOf(event),
	}
}

/** The `stateHash` an event or a record carries (D29), as a field to spread; none when it holds no string. */
function stateHashOf(carrier: Readonly<Record<string, unknown>>): { stateHash?: string } {
	return typeof carrier.stateHash === 'string' ? { stateHash: carrier.stateHash } : {}
}

/**
 * A station start or end with the step, round, verdict and exit it carries; an end that carries neither step nor round
 * takes its paired start's (D32); undefined without a run or a station.
 */
function stationEntryOf(params: {
	event: LotEvent
	starts: ReadonlyMap<string, LotEvent>
}): TimelineEntry | undefined {
	const { event } = params
	if (typeof event.run !== 'string' || typeof event.station !== 'string') return undefined
	const own = positionOf({ event })
	const start = params.starts.get(event.run)
	const position =
		event.kind === 'station.end' && Object.keys(own).length === 0 && start !== undefined
			? positionOf({ event: start })
			: own
	if (event.kind === 'station.start')
		return {
			kind: 'station.start',
			run: event.run,
			station: event.station,
			...position,
			at: event.at,
		}
	const verdict = STATION_VERDICTS.find((known) => known === event.verdict)
	return {
		kind: 'station.end',
		run: event.run,
		station: event.station,
		...position,
		...(verdict !== undefined && { verdict }),
		...(typeof event.exit === 'number' && { exit: event.exit }),
		...stateHashOf(event),
	}
}

/** The step and round an event carries, as fields to spread; none it does not carry. */
function positionOf(params: { event: LotEvent }): RunPosition {
	const { event } = params
	return {
		...(typeof event.step === 'number' && { step: event.step }),
		...(typeof event.round === 'number' && { round: event.round }),
	}
}

/** The `round-<n>/` snapshots, each at the `at` of its `.state` (33L1 D7), else the mtime of its `.base`. */
function snapshotEntries(params: { lotFolder: string }): TimedEntry[] {
	return snapshotRounds(params.lotFolder).map((round) => ({
		at: snapshotTimeOf({ lotFolder: params.lotFolder, round }),
		rank: RECORD_RANK,
		entry: { kind: 'snapshot', round },
	}))
}

/** When a round's snapshot was taken: its `.state`'s `at`, else its `.base`'s mtime; null when neither reads. */
export function snapshotTimeOf(params: { lotFolder: string; round: number }): string | null {
	const names = roundNames(params.round)
	try {
		const state = JSON.parse(readFileSync(join(params.lotFolder, names.state), 'utf8')) as {
			at?: unknown
		} | null
		if (typeof state?.at === 'string') return state.at
	} catch {
		// no state, or one that does not parse: the base's time
	}
	try {
		return statSync(join(params.lotFolder, names.base)).mtime.toISOString()
	} catch {
		return null
	}
}

/**
 * The worktree's records as checks (33L1 D5, D6, D21.1): in `records` mode its tdd ledger entries and every gate
 * record with its result; otherwise only the failed gate records (a newer red record cancels an event's check).
 */
function recordEntries(params: {
	worktree: string | null
	records: RecordTimesRead | undefined
	checks: StationRecords['checks']
}): TimedEntry[] {
	const { worktree, records } = params
	if (worktree === null || records === undefined || records.gone) return []
	const all = params.checks === 'records'
	const entries: TimedEntry[] = all ? ledgerEntries({ tdd: records.times.tdd }) : []
	for (const { mode, check } of RECORD_CHECKS) {
		const result = readGateRecordResult({ worktree, mode })
		if (result !== null && (all || !result.green))
			entries.push({
				at: result.at,
				rank: RECORD_RANK,
				entry: checkEntryOf({ check, passed: result.green, stateHash: result.stateHash }),
			})
	}
	return entries
}

/** The tdd ledger's entries of a known step, as passed checks at their time. */
function ledgerEntries(params: { tdd: TddEntryTime[] | null }): TimedEntry[] {
	return (params.tdd ?? []).flatMap(function ledgerEntryOf(time) {
		return time.step === null
			? []
			: [
					{
						at: time.at,
						rank: RECORD_RANK,
						entry: checkEntryOf({ check: time.step, passed: true }),
					},
				]
	})
}

/** A check of the worktree's records; a gate record's state hash carried (D29: it may count inside a station's run). */
function checkEntryOf(params: {
	check: CheckName
	passed: boolean
	stateHash?: string
}): TimelineEntry {
	return {
		kind: 'check',
		check: params.check,
		passed: params.passed,
		throwaway: false,
		...stateHashOf(params),
	}
}

/** Orders by time (none last), then an entry before an event of the same time. */
function byTimeAndRank(first: TimedEntry, second: TimedEntry): number {
	if (first.at !== second.at) {
		if (first.at === null) return 1
		if (second.at === null) return -1
		return first.at < second.at ? -1 : 1
	}
	return first.rank - second.rank
}
