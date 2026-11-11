import {
	MS_PER_SECOND,
	ORCHESTRATION_STEPS,
	OUTSIDE_OWNER,
	SHARED_OWNER,
} from './attribute-steps.constants.ts'
import { firstEventOf } from './pair-runs.ts'

import type {
	AgentTime,
	AttributedStep,
	Interval,
	QuestionTime,
	RunAttributedStep,
	TimeBreakdown,
	WaitTime,
} from './attribute-steps.types.ts'
import type { EventRun } from './event.types.ts'

/**
 * Attributes each step run (not a folder step) to the station run whose interval holds the step's start: one station,
 * `shared` (several), `outside` (none, or a step the orchestration runs). Open runs last to `now`.
 */
export function attributeSteps(params: {
	stationRuns: readonly EventRun[]
	stepRuns: readonly EventRun[]
	now: string
}): AttributedStep[] {
	return attributeStepsToRuns(params).map(({ run, step, owner }) => ({ run, step, owner }))
}

/**
 * As `attributeSteps`, each step with the station run that holds its start when exactly one does (`stationRun`),
 * else `null` (`shared` or `outside`).
 */
export function attributeStepsToRuns(params: {
	stationRuns: readonly EventRun[]
	stepRuns: readonly EventRun[]
	now: string
}): RunAttributedStep[] {
	const now = Date.parse(params.now)
	const orchestration: readonly string[] = ORCHESTRATION_STEPS
	const stations = params.stationRuns.flatMap((run) => {
		const interval = stationIntervalOf({ run, openUntil: now })
		const { station } = firstEventOf({ run })
		return interval === null || typeof station !== 'string'
			? []
			: [{ interval, station, stationRun: run.run }]
	})
	return params.stepRuns.map((run) => {
		const step = String(firstEventOf({ run }).step ?? '')
		const started = stepIntervalOf({ run, openUntil: now })?.start ?? null
		if (orchestration.includes(step) || started === null)
			return { run: run.run, step, owner: OUTSIDE_OWNER, stationRun: null }
		const holding = stations.filter(
			({ interval }) => interval.start <= started && started <= interval.end,
		)
		const [only] = holding
		if (holding.length === 1 && only !== undefined)
			return { run: run.run, step, owner: only.station, stationRun: only.stationRun }
		const owner = holding.length === 0 ? OUTSIDE_OWNER : SHARED_OWNER
		return { run: run.run, step, owner, stationRun: null }
	})
}

/**
 * The time of a lot from `from` to `to` in five categories by union of intervals, assigned in the order agents, cli
 * steps, waiting for answers, waiting for the machine, other; `agentTime` is the sum of station durations, apart.
 */
export function timeBreakdown(params: {
	from: string
	to: string
	now: string
	stationRuns: readonly EventRun[]
	stepRuns: readonly EventRun[]
	questions: readonly QuestionTime[]
	waits: readonly WaitTime[]
}): TimeBreakdown {
	const bounds: Interval = { start: Date.parse(params.from), end: Date.parse(params.to) }
	const openUntil = Math.min(Date.parse(params.now), bounds.end)
	const stationIntervals = params.stationRuns.flatMap((run) => {
		const interval = stationIntervalOf({ run, openUntil })
		return interval === null ? [] : [interval]
	})
	const categories: Interval[][] = [
		stationIntervals,
		params.stepRuns.flatMap((run) => {
			const interval = stepIntervalOf({ run, openUntil })
			return interval === null ? [] : [interval]
		}),
		params.questions.map((question) => ({
			start: Date.parse(question.asked),
			end: question.answered === null ? openUntil : Date.parse(question.answered),
		})),
		params.waits.map((wait) => ({
			start: Date.parse(wait.at) - wait.waitedMs,
			end: Date.parse(wait.at),
		})),
	]
	let taken: Interval[] = []
	const spans = categories.map((intervals) => {
		const clipped = intervals.flatMap((interval) => clip({ interval, bounds }))
		const before = lengthOf({ intervals: taken })
		taken = unionOf({ intervals: [...taken, ...clipped] })
		return lengthOf({ intervals: taken }) - before
	})
	const [agents = 0, cliSteps = 0, waiting = 0, machine = 0] = spans
	const elapsed = Math.max(0, bounds.end - bounds.start)
	return {
		elapsed: elapsed / MS_PER_SECOND,
		agents: agents / MS_PER_SECOND,
		cliSteps: cliSteps / MS_PER_SECOND,
		waiting: waiting / MS_PER_SECOND,
		machine: machine / MS_PER_SECOND,
		other: (elapsed - agents - cliSteps - waiting - machine) / MS_PER_SECOND,
		agentTime: agentTimeOf({ stationRuns: params.stationRuns, openUntil }),
	}
}

/**
 * The agent time of station runs (the one figure the report and the card's usage row give): each run's interval
 * (`stationIntervalOf`, an open run to `openUntil`), unclipped, summed; a run with none counted unknown. No runs:
 * `{ known: 0, unknownRuns: 0 }`; runs and none with a time: `null`.
 */
export function agentTimeOf(params: {
	stationRuns: readonly EventRun[]
	openUntil: number
}): AgentTime {
	let knownMs = 0
	let unknownRuns = 0
	for (const run of params.stationRuns) {
		const interval = stationIntervalOf({ run, openUntil: params.openUntil })
		if (interval === null) unknownRuns += 1
		else knownMs += interval.end - interval.start
	}
	if (params.stationRuns.length > 0 && unknownRuns === params.stationRuns.length) return null
	return { known: knownMs / MS_PER_SECOND, unknownRuns }
}

/**
 * A station run's interval (ms): start to end; an open run to `openUntil`; an end-only run `[end - duration, end]`
 * when a duration was reported, else none. A run ending before its start has its reported interval, else none.
 */
export function stationIntervalOf(params: { run: EventRun; openUntil: number }): Interval | null {
	const { start, end } = params.run
	const duration = typeof end?.duration === 'number' ? end.duration * MS_PER_SECOND : null
	return intervalOf({
		start: start === undefined ? null : Date.parse(start.at),
		end: end === undefined ? null : Date.parse(end.at),
		duration,
		openUntil: params.openUntil,
	})
}

/** A step run's interval (ms), as a station's, its duration the cli's `durationMs`. */
export function stepIntervalOf(params: { run: EventRun; openUntil: number }): Interval | null {
	const { start, end } = params.run
	return intervalOf({
		start: start === undefined ? null : Date.parse(start.at),
		end: end === undefined ? null : Date.parse(end.at),
		duration: typeof end?.durationMs === 'number' ? end.durationMs : null,
		openUntil: params.openUntil,
	})
}

/** An interval from a start, an end and a duration, any of them missing; `null` when they make none. */
function intervalOf(params: {
	start: number | null
	end: number | null
	duration: number | null
	openUntil: number
}): Interval | null {
	const { start, end, duration } = params
	if (start !== null && end !== null && end >= start) return { start, end }
	if (start !== null && end === null) return { start, end: Math.max(start, params.openUntil) }
	if (end !== null && duration !== null && duration >= 0) return { start: end - duration, end }
	return null
}

/** The part of an interval inside the bounds: none when nothing of it is. */
function clip(params: { interval: Interval; bounds: Interval }): Interval[] {
	const start = Math.max(params.interval.start, params.bounds.start)
	const end = Math.min(params.interval.end, params.bounds.end)
	return end > start ? [{ start, end }] : []
}

/** The union of intervals, as disjoint intervals in time order. */
function unionOf(params: { intervals: readonly Interval[] }): Interval[] {
	const sorted = [...params.intervals].sort((left, right) => left.start - right.start)
	const merged: Interval[] = []
	for (const interval of sorted) {
		const last = merged.at(-1)
		if (last !== undefined && interval.start <= last.end)
			last.end = Math.max(last.end, interval.end)
		else merged.push({ ...interval })
	}
	return merged
}

/** The total length of disjoint intervals. */
function lengthOf(params: { intervals: readonly Interval[] }): number {
	return params.intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0)
}
