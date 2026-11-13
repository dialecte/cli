import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	AGAIN_VERDICTS,
	EDIT_STATIONS,
	NEXT_STATION_WHY,
	RECORD_GATE_CHECKS,
	REVIEW_ROUND_CAPS,
	ROUND_STATIONS,
	STATION_NAMES,
	STATIONLESS_STATES,
	STEP_STATIONS,
	TEST_REVIEW_BACK_LIMIT,
	TEST_REVIEW_BACK_MAX,
	UNKNOWN_EFFORT_CAP,
} from './next-station.constants.ts'

import type { BriefEffort } from './brief.types.ts'
import type {
	CheckName,
	CheckPoint,
	NextCheckName,
	NextStation,
	NextStationKind,
	PlacedEnd,
	RoundOutcome,
	StationName,
	StationRecords,
	StationWalk,
	TimelineEntry,
	TimelineIndex,
	WhyValues,
} from './next-station.types.ts'

/**
 * The cap of review rounds for an effort (low 1, medium 2, high 3); an unknown effort has the cap of 1 (33L1 D2).
 * One table for the walk and `lot snapshot`.
 */
export function capOf(params: { effort: BriefEffort | undefined }): number {
	return params.effort === undefined ? UNKNOWN_EFFORT_CAP : REVIEW_ROUND_CAPS[params.effort]
}

/**
 * The next station of a lot: a pure walk through the loop over the lot's records, the first unmet row wins (33L1
 * section 4). One pass indexes the timeline by position; each phase then reads that index.
 */
export function nextStation(records: StationRecords): NextStation {
	const walk: StationWalk = { records, index: indexTimeline(records.timeline) }
	return (
		terminalStateNext(walk) ??
		questionNext(walk) ??
		runningNext(walk) ??
		unrecordedNext(walk) ??
		stepsNext(walk) ??
		reviewRoundsNext(walk) ??
		closingNext(walk)
	)
}

// ---------------------------------------------------------------------------------------------------------------
// The index: one pass over the timeline
// ---------------------------------------------------------------------------------------------------------------

/** The timeline indexed by position: placed ends by step and round, checks, snapshots, edits, open starts. */
function indexTimeline(timeline: TimelineEntry[]): TimelineIndex {
	const endedRuns = new Set<string>()
	let lastClosing = -1
	timeline.forEach(function noteEach(entry, position) {
		if (entry.kind === 'station.end') endedRuns.add(entry.run)
		if (entry.kind !== 'check') lastClosing = position
	})
	const index: TimelineIndex = {
		stepEnds: new Map(),
		roundEnds: new Map(),
		independentEnds: [],
		independentFixerEnds: [],
		checks: new Map(),
		snapshots: new Set(),
		editPositions: [],
		running: null,
		stationRecorded: false,
		unplaced: 0,
		noEnd: [],
	}
	const seenEnds = new Set<string>()
	const startPositions = new Map<string, number>()
	timeline.forEach(function indexEach(entry, position) {
		indexEntry({
			index,
			entry,
			position,
			endedRuns,
			seenEnds,
			startPositions,
			last: position === lastClosing,
		})
	})
	return index
}

/** One timeline entry into the index; a second end of a run is skipped (it counts once). */
function indexEntry(params: {
	index: TimelineIndex
	entry: TimelineEntry
	position: number
	endedRuns: Set<string>
	seenEnds: Set<string>
	/** The position of each run's start seen so far. */
	startPositions: Map<string, number>
	/** Whether no station event or snapshot follows (a check never closes an open start, D32). */
	last: boolean
}): void {
	const { index, entry, position, endedRuns, seenEnds, startPositions, last } = params
	if (entry.kind === 'snapshot') {
		index.snapshots.add(entry.round)
		return
	}
	if (entry.kind === 'check') {
		if (entry.throwaway) return
		const points = index.checks.get(entry.check) ?? []
		points.push({ position, passed: entry.passed, stateHash: entry.stateHash })
		index.checks.set(entry.check, points)
		return
	}
	index.stationRecorded = true
	if (entry.kind === 'station.start') {
		if (!startPositions.has(entry.run)) startPositions.set(entry.run, position)
		if (isEditStation(entry.station)) index.editPositions.push(position)
		if (endedRuns.has(entry.run)) return
		if (last) index.running = entry
		else if (!index.noEnd.includes(entry.run)) index.noEnd.push(entry.run)
		return
	}
	if (seenEnds.has(entry.run)) return
	seenEnds.add(entry.run)
	if (isEditStation(entry.station)) index.editPositions.push(position)
	placeEnd({ index, entry, position, start: startPositions.get(entry.run) ?? null })
}

/** A station end into its step, its round, or the independent review; counted `unplaced` when it has no place. */
function placeEnd(params: {
	index: TimelineIndex
	entry: Extract<TimelineEntry, { kind: 'station.end' }>
	position: number
	/** The position of its run's start; null for an end recorded alone. */
	start: number | null
}): void {
	const { index, entry, position, start } = params
	const { station } = entry
	if (!isStationName(station)) {
		index.unplaced += 1
		return
	}
	const end: PlacedEnd = {
		position,
		station,
		step: entry.step ?? null,
		round: entry.round ?? null,
		verdict: entry.verdict,
		exit: entry.exit,
		start,
		stateHash: entry.stateHash,
	}
	if (station === 'independent-reviewer') index.independentEnds.push(end)
	else if (station === 'fixer' && followsIndependentFix(index)) index.independentFixerEnds.push(end)
	else if (STEP_STATIONS.includes(station))
		addPlaced({ index, ends: index.stepEnds, key: end.step, end })
	else if (ROUND_STATIONS.includes(station))
		addPlaced({ index, ends: index.roundEnds, key: end.round, end })
}

/** An end under its step or round; without one it is `unplaced`. */
function addPlaced(params: {
	index: TimelineIndex
	ends: Map<number, PlacedEnd[]>
	key: number | null
	end: PlacedEnd
}): void {
	const { index, ends, key, end } = params
	if (key === null) {
		index.unplaced += 1
		return
	}
	const list = ends.get(key) ?? []
	list.push(end)
	ends.set(key, list)
}

/** Whether the last independent review so far asked for a fix (a `fixer` end then belongs to it, D11). */
function followsIndependentFix(index: TimelineIndex): boolean {
	const review = index.independentEnds.at(-1)
	return review !== undefined && isEnded(review) && review.verdict === 'fix-then-repass'
}

function isStationName(name: string): name is StationName {
	return (STATION_NAMES as readonly string[]).includes(name)
}

function isEditStation(name: string): boolean {
	return isStationName(name) && EDIT_STATIONS.includes(name)
}

// ---------------------------------------------------------------------------------------------------------------
// Rows 1-3 and the unknown walk
// ---------------------------------------------------------------------------------------------------------------

/** Row 1: a state that answers without a station walk. */
function terminalStateNext(walk: StationWalk): NextStation | null {
	const { state } = walk.records
	if (!STATIONLESS_STATES.includes(state)) return null
	return nextOf({ walk, kind: 'none', why: whyOf({ name: 'lotState', values: { state } }) })
}

/** Row 2: an open question. */
function questionNext(walk: StationWalk): NextStation | null {
	const id = walk.records.openQuestion
	if (id === null) return null
	return nextOf({ walk, kind: 'answer', why: whyOf({ name: 'questionOpen', values: { id } }) })
}

/** Row 3: the last entry is a start with no end. */
function runningNext(walk: StationWalk): NextStation | null {
	const start = walk.index.running
	if (start === null) return null
	return nextOf({
		walk,
		kind: 'running',
		station: start.station,
		step: start.step,
		round: start.round,
		why: whyOf({
			name: 'running',
			values: { station: start.station, at: start.at, run: start.run },
		}),
	})
}

/** No station event while the worktree holds records: the host records nothing (never row 4). */
function unrecordedNext(walk: StationWalk): NextStation | null {
	if (walk.index.stationRecorded || !walk.records.worktreeRecords) return null
	return nextOf({ walk, kind: 'unknown', why: whyOf({ name: 'noStationRecorded' }) })
}

// ---------------------------------------------------------------------------------------------------------------
// Rows 4-8: the steps
// ---------------------------------------------------------------------------------------------------------------

/** Rows 4-8 for each step in order; `null` when every step is done. */
function stepsNext(walk: StationWalk): NextStation | null {
	for (let step = 1; step <= walk.records.steps; step += 1) {
		const next = stepNext({ walk, step })
		if (next !== null) return next
	}
	return null
}

/** Rows 4-6 of one step: written, red proved, tests reviewed (not at low effort); then its implementation. */
function stepNext(params: { walk: StationWalk; step: number }): NextStation | null {
	const { walk, step } = params
	const ends = walk.index.stepEnds.get(step) ?? []
	const written = lastEndOf({ ends, station: 'test-writer' })
	if (written === undefined)
		return stationNext({
			walk,
			station: 'test-writer',
			step,
			why: whyOf({ name: 'noTest', values: { step } }),
		})
	if (!isEnded(written)) return againNext({ walk, end: written, step })
	const red = claimChecked({ walk, check: 'tdd-red', claim: written })
	if (red === null)
		return checkNext({
			walk,
			check: 'tdd-red',
			step,
			why: whyOf({ name: 'redNotProved', values: { step } }),
		})
	if (walk.records.effort === 'low')
		return implementationNext({
			walk,
			ends,
			step,
			after: red,
			why: whyOf({ name: 'notImplementedLow', values: { step } }),
		})
	const review = lastEndOf({ ends, station: 'test-reviewer', after: red })
	if (review === undefined)
		return stationNext({
			walk,
			station: 'test-reviewer',
			step,
			why: whyOf({ name: 'testsNotReviewed', values: { step } }),
		})
	if (!isEnded(review)) return againNext({ walk, end: review, step })
	if (review.verdict === 'back') return testReviewBackNext({ walk, ends, step, review })
	if (review.verdict !== 'approve') return unexpectedVerdictNext({ walk, end: review })
	return implementationNext({
		walk,
		ends,
		step,
		after: review.position,
		why: whyOf({ name: 'notImplemented', values: { step } }),
	})
}

/** Row 6 after a `back`: the test-writer again, or the person at the limit; the count resets on an approval. */
function testReviewBackNext(params: {
	walk: StationWalk
	ends: PlacedEnd[]
	step: number
	review: PlacedEnd
}): NextStation {
	const { walk, ends, step, review } = params
	let backs = 0
	for (const end of ends) {
		if (end.station !== 'test-reviewer' || end.position > review.position) continue
		if (end.verdict === 'approve') backs = 0
		else if (end.verdict === 'back') backs += 1
	}
	if (backs >= TEST_REVIEW_BACK_LIMIT)
		return nextOf({
			walk,
			kind: 'question',
			step,
			why: whyOf({ name: 'testReviewBackLimit', values: { limit: TEST_REVIEW_BACK_LIMIT } }),
		})
	return stationNext({
		walk,
		station: 'test-writer',
		step,
		why: whyOf({ name: 'testReviewBack', values: { n: backs, max: TEST_REVIEW_BACK_MAX } }),
	})
}

/** Rows 7, 7b, 8: the implementer after the approval (or the red), then its claim checked; `null` when done. */
function implementationNext(params: {
	walk: StationWalk
	ends: PlacedEnd[]
	step: number
	after: number
	why: string
}): NextStation | null {
	const { walk, ends, step, after, why } = params
	const implemented = lastEndOf({ ends, station: 'implementer', after })
	if (implemented === undefined) return stationNext({ walk, station: 'implementer', step, why })
	if (!isEnded(implemented)) return againNext({ walk, end: implemented, step })
	if (implemented.verdict === 'back')
		return stationNext({ walk, station: 'test-writer', step, why: whyOf({ name: 'testWrong' }) })
	const green = claimChecked({ walk, check: 'tdd-green', claim: implemented })
	const fast = claimChecked({ walk, check: 'gate-fast', claim: implemented })
	if (green !== null && fast !== null) return null
	return checkNext({
		walk,
		check: 'tdd-green-and-gate-fast',
		step,
		why: whyOf({ name: 'claimUnchecked', values: { step } }),
	})
}

// ---------------------------------------------------------------------------------------------------------------
// Rows 9-13: the review rounds
// ---------------------------------------------------------------------------------------------------------------

/** Rows 9-13, round 1 first; `null` when a round is approved. */
function reviewRoundsNext(walk: StationWalk): NextStation | null {
	const cap = capOf({ effort: walk.records.effort })
	for (let round = 1; ; round += 1) {
		const outcome = roundNext({ walk, round, cap })
		if (outcome === 'approved') return null
		if (outcome !== 'fixed') return outcome
	}
}

/** Rows 9, 10, 13 of one round: its snapshot (or the cap question), its reviewer, then its fix. */
function roundNext(params: { walk: StationWalk; round: number; cap: number }): RoundOutcome {
	const { walk, round, cap } = params
	if (!walk.index.snapshots.has(round)) {
		if (round > cap && !walk.records.beyondCap.includes(round))
			return nextOf({
				walk,
				kind: 'question',
				round,
				why: whyOf({ name: 'roundCap', values: { cap } }),
			})
		return nextOf({
			walk,
			kind: 'snapshot',
			round,
			why: whyOf({ name: 'notSnapshot', values: { round } }),
		})
	}
	const ends = walk.index.roundEnds.get(round) ?? []
	const review = lastEndOf({ ends, station: 'reviewer' })
	if (review === undefined)
		return stationNext({
			walk,
			station: 'reviewer',
			round,
			why: whyOf({ name: 'notReviewed', values: { round } }),
		})
	if (!isEnded(review)) return againNext({ walk, end: review, round })
	if (review.verdict === 'approve') return 'approved'
	if (review.verdict !== 'fix-then-repass') return unexpectedVerdictNext({ walk, end: review })
	return roundFixNext({ walk, ends, round, review })
}

/** Rows 11-12: the fixer after the round's last reviewer end, the adjudicator on `disagreed`, then the fast gate. */
function roundFixNext(params: {
	walk: StationWalk
	ends: PlacedEnd[]
	round: number
	review: PlacedEnd
}): RoundOutcome {
	const { walk, ends, round, review } = params
	const fixed = lastEndOf({ ends, station: 'fixer', after: review.position })
	if (fixed === undefined)
		return stationNext({
			walk,
			station: 'fixer',
			round,
			why: whyOf({ name: 'reviewerFix', values: { round } }),
		})
	if (!isEnded(fixed)) return againNext({ walk, end: fixed, round })
	let work = fixed
	if (fixed.verdict === 'disagreed') {
		const adjudicated = lastEndOf({ ends, station: 'adjudicator', after: fixed.position })
		if (adjudicated === undefined)
			return stationNext({
				walk,
				station: 'adjudicator',
				round,
				why: whyOf({ name: 'fixerDisagreed', values: { round } }),
			})
		if (!isEnded(adjudicated)) return againNext({ walk, end: adjudicated, round })
		work = adjudicated
	}
	if (claimChecked({ walk, check: 'gate-fast', claim: work }) !== null) return 'fixed'
	return checkNext({
		walk,
		check: 'gate-fast',
		round,
		why: whyOf({ name: 'fixerClaimUnchecked', values: { round } }),
	})
}

// ---------------------------------------------------------------------------------------------------------------
// Rows 14-17: the closing rows
// ---------------------------------------------------------------------------------------------------------------

/** Rows 16b, 14, 15, 16, 17: the independent review's fix, the full gate after the last edit, contrib, the hand-over. */
function closingNext(walk: StationWalk): NextStation {
	const fix = independentFixNext(walk)
	if (fix !== null) return fix
	const lastEdit = walk.index.editPositions.at(-1) ?? -1
	const fullGate = checkedAfter({ walk, check: 'gate-full', after: lastEdit })
	if (fullGate === null)
		return checkNext({ walk, check: 'gate-full', why: whyOf({ name: 'noFullGate' }) })
	if (walk.records.producer && checkedAfter({ walk, check: 'contrib', after: fullGate }) === null)
		return checkNext({ walk, check: 'contrib', why: whyOf({ name: 'noContrib' }) })
	return independentReviewNext({ walk, after: fullGate }) ?? handoverNext(walk)
}

/** Row 16b: the last independent review asked for a fix: its fixer (no round), then the fast gate. */
function independentFixNext(walk: StationWalk): NextStation | null {
	if (!followsIndependentFix(walk.index)) return null
	const review = walk.index.independentEnds.at(-1)
	const after = review === undefined ? -1 : review.position
	const fixed = lastEndOf({ ends: walk.index.independentFixerEnds, station: 'fixer', after })
	if (fixed === undefined)
		return stationNext({ walk, station: 'fixer', why: whyOf({ name: 'independentFix' }) })
	if (!isEnded(fixed)) return againNext({ walk, end: fixed })
	if (claimChecked({ walk, check: 'gate-fast', claim: fixed }) !== null) return null
	return checkNext({
		walk,
		check: 'gate-fast',
		why: whyOf({ name: 'independentFixerClaimUnchecked' }),
	})
}

/** Row 16: an independent review ended after the full gate. */
function independentReviewNext(params: { walk: StationWalk; after: number }): NextStation | null {
	const { walk, after } = params
	const review = lastEndOf({
		ends: walk.index.independentEnds,
		station: 'independent-reviewer',
		after,
	})
	if (review === undefined)
		return stationNext({
			walk,
			station: 'independent-reviewer',
			why: whyOf({ name: 'noIndependent' }),
		})
	if (!isEnded(review)) return againNext({ walk, end: review })
	// no verdict, or a word the row does not read, never reads as done (R2-3, R1-2's rule)
	if (review.verdict !== 'approve' && review.verdict !== 'fix-then-repass')
		return unexpectedVerdictNext({ walk, end: review })
	return null
}

/** Row 17: the hand-over, written once a registry entry holds the lot folder. */
function handoverNext(walk: StationWalk): NextStation {
	if (walk.records.registered)
		return nextOf({ walk, kind: 'none', why: whyOf({ name: 'handoverWritten' }) })
	return nextOf({ walk, kind: 'handover-write', why: whyOf({ name: 'noHandover' }) })
}

// ---------------------------------------------------------------------------------------------------------------
// Evidence and results
// ---------------------------------------------------------------------------------------------------------------

/** Ended: exit 0 or absent, and a verdict that does not run the station again (the walk's rule, the card's too). */
export function isEnded(end: Pick<PlacedEnd, 'verdict' | 'exit'>): boolean {
	if (end.exit !== undefined && end.exit !== 0) return false
	return end.verdict === undefined || !AGAIN_VERDICTS.includes(end.verdict)
}

/** The last end of a station after a position. */
function lastEndOf(params: {
	ends: PlacedEnd[]
	station: StationName
	after?: number
}): PlacedEnd | undefined {
	const { ends, station, after = -1 } = params
	for (let at = ends.length - 1; at >= 0; at -= 1) {
		const end = ends[at]
		if (end.position <= after) return undefined
		if (end.station === station) return end
	}
	return undefined
}

/**
 * The position of the check that proves what stands at `after`: the last non-throwaway entry of that check after
 * it and before the next edit station, when it passed (a later failed entry cancels an earlier pass, D12).
 */
function checkedAfter(params: {
	walk: StationWalk
	check: CheckName
	after: number
}): number | null {
	const { walk, check, after } = params
	const point = lastCheckPoint({
		walk,
		check,
		from: after,
		before: boundOf({ walk, check, after }),
	})
	return point?.passed ? point.position : null
}

/**
 * The position of the check that proves a station's claim (D5, D29): the last non-throwaway entry of that check
 * before the next edit station, after the end, or inside the station's run when it ran on the tree the end handed
 * over (its `stateHash` the end's); a later failed entry cancels an earlier pass (D12).
 */
function claimChecked(params: {
	walk: StationWalk
	check: CheckName
	claim: PlacedEnd
}): number | null {
	const { walk, check, claim } = params
	const inRun = claim.start !== null && claim.stateHash !== undefined
	const point = lastCheckPoint({
		walk,
		check,
		from: inRun && claim.start !== null ? claim.start : claim.position,
		before: boundOf({ walk, check, after: claim.position }),
	})
	if (point === undefined || !point.passed) return null
	if (point.position > claim.position || point.stateHash === claim.stateHash) return point.position
	return null
}

/** The last non-throwaway entry of a check after `from` and before `before` (no bound when undefined). */
function lastCheckPoint(params: {
	walk: StationWalk
	check: CheckName
	from: number
	before: number | undefined
}): CheckPoint | undefined {
	const { from, before } = params
	const points = params.walk.index.checks.get(params.check) ?? []
	for (let at = points.length - 1; at >= 0; at -= 1) {
		const point = points[at]
		if (point.position <= from) return undefined
		if (before === undefined || point.position < before) return point
	}
	return undefined
}

/**
 * The bound of a check proving what stands at `after`: the next edit station after it. None for a gate record in
 * `records` mode (R1-1): a worktree keeps one record per gate mode, so a later green record of that mode stands for
 * every earlier claim (a later failed one still cancels them, D12).
 */
function boundOf(params: {
	walk: StationWalk
	check: CheckName
	after: number
}): number | undefined {
	const { walk, check, after } = params
	if (walk.records.checks === 'records' && RECORD_GATE_CHECKS.includes(check)) return undefined
	return walk.index.editPositions.find(function isLaterEdit(position) {
		return position > after
	})
}

/** A station end with `failed`, `limit` or a non-zero exit: the same station again. */
function againNext(params: {
	walk: StationWalk
	end: PlacedEnd
	step?: number
	round?: number
}): NextStation {
	const { walk, end, step, round } = params
	const why =
		end.verdict !== undefined && AGAIN_VERDICTS.includes(end.verdict)
			? whyOf({ name: 'stationAgain', values: { station: end.station, verdict: end.verdict } })
			: whyOf({ name: 'stationAgainExit', values: { station: end.station, exit: end.exit ?? 0 } })
	return stationNext({ walk, station: end.station, step, round, why })
}

/**
 * A reviewing end whose verdict the table does not read (R1-2): none, or a word of another station. The walk cannot
 * tell what comes next, so it never moves on to a later station.
 */
function unexpectedVerdictNext(params: { walk: StationWalk; end: PlacedEnd }): NextStation {
	const { walk, end } = params
	const why =
		end.verdict === undefined
			? whyOf({ name: 'endedWithoutVerdict', values: { station: end.station } })
			: whyOf({ name: 'endedWithVerdict', values: { station: end.station, verdict: end.verdict } })
	return nextOf({ walk, kind: 'unknown', why })
}

function stationNext(params: {
	walk: StationWalk
	station: StationName
	step?: number
	round?: number
	why: string
}): NextStation {
	return nextOf({ ...params, kind: 'station' })
}

/** A check to run, or `unknown` when the worktree's cli records no steps (D12). */
function checkNext(params: {
	walk: StationWalk
	check: NextCheckName
	step?: number
	round?: number
	why: string
}): NextStation {
	if (params.walk.records.checks === 'none')
		return nextOf({ walk: params.walk, kind: 'unknown', why: whyOf({ name: 'noStepRecords' }) })
	return nextOf({ ...params, kind: 'check' })
}

function nextOf(params: {
	walk: StationWalk
	kind: NextStationKind
	why: string
	station?: string
	check?: NextCheckName
	step?: number
	round?: number
}): NextStation {
	const { walk, kind, why, station, check, step, round } = params
	return {
		kind,
		station: station ?? null,
		check: check ?? null,
		step: step ?? null,
		round: round ?? null,
		why,
		unplaced: walk.index.unplaced,
		noEnd: [...walk.index.noEnd],
	}
}

/** A `why` line from its `NEXT_STATION_WHY` template. */
function whyOf(params: { name: keyof typeof NEXT_STATION_WHY; values?: WhyValues }): string {
	const values: Record<string, string> = {}
	for (const [placeholder, value] of Object.entries(params.values ?? {}))
		values[placeholder] = String(value)
	return fillMessage({ template: NEXT_STATION_WHY[params.name], values })
}
