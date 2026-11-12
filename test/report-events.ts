/** Plain events and record times for the report model's tests: no disk, no clock. */
import { pairRuns } from '../src/lib/events/pair-runs.ts'
import { LOT_WORKTREE, TEST_DAY } from './report-events.constants.ts'

import type { EventRun, LotEvent, PairRunsResult } from '../src/lib/events/event.types.ts'
import type { WorktreeRecordTimes } from '../src/lib/events/unrecorded-steps.types.ts'
import type { StationRunParams, StepRunParams } from './report-events.types.ts'

/** An ISO time of the test day: `10:05` or `10:05:30`. */
export function timeOf(clock: string): string {
	return `${TEST_DAY}T${clock.length === 5 ? `${clock}:00` : clock}.000Z`
}

/** An event with a full envelope; the fields of its kind in `fields`. */
export function eventOf(
	params: { id: string; at: string; kind: string } & Record<string, unknown>,
): LotEvent {
	return {
		schema: 1,
		lot: '0171-scl-subscribe',
		by: 'host',
		pid: 100,
		cli: '0.4.0',
		simulated: false,
		hostEvent: null,
		...params,
	} as LotEvent
}

/** The start and the end of a station run; a side given as `null` is left out (an end-only or an open run). */
export function stationRun(params: StationRunParams): LotEvent[] {
	const events: LotEvent[] = []
	if (params.start !== null)
		events.push(
			eventOf({
				id: `ev-${params.run}-start`,
				at: timeOf(params.start),
				kind: 'station.start',
				run: params.run,
				station: params.station,
				...params.startFields,
			}),
		)
	if (params.end !== null)
		events.push(
			eventOf({
				id: `ev-${params.run}-end`,
				at: timeOf(params.end),
				kind: 'station.end',
				run: params.run,
				station: params.station,
				...params.endFields,
			}),
		)
	return events
}

/** The start and the end of a step run (the lot's worktree unless said); a side given as `null` is left out. */
export function stepRun(params: StepRunParams): LotEvent[] {
	const common = {
		run: params.run,
		step: params.step,
		worktree: params.worktree ?? LOT_WORKTREE,
		throwaway: params.throwaway ?? false,
		by: 'cli',
		...params.worktreeCli,
	}
	const events: LotEvent[] = []
	if (params.start !== null)
		events.push(
			eventOf({
				id: `ev-${params.run}-start`,
				at: timeOf(params.start),
				kind: 'step.start',
				...common,
				...params.startFields,
			}),
		)
	if (params.end !== null)
		events.push(
			eventOf({
				id: `ev-${params.run}-end`,
				at: timeOf(params.end),
				kind: 'step.end',
				exit: 0,
				...common,
				...params.endFields,
			}),
		)
	return events
}

/** The events paired as the model pairs them (sorted by time first, as the reader gives them). */
export function pairedOf(params: { events: LotEvent[] }): PairRunsResult {
	const sorted = [...params.events].sort((left, right) => left.at.localeCompare(right.at))
	return pairRuns({ events: sorted })
}

/** The runs of the kind of events, paired. */
export function runsOf(params: { events: LotEvent[]; kindPrefix: 'station' | 'step' }): EventRun[] {
	return pairedOf({ events: params.events }).runs.filter((run) =>
		(run.start ?? run.end)?.kind.startsWith(params.kindPrefix),
	)
}

/** The record times of a worktree: none unless given. */
export function recordsOf(
	params: { worktree: string } & Partial<WorktreeRecordTimes>,
): WorktreeRecordTimes {
	return {
		gateFast: null,
		gateFull: null,
		gateRelease: null,
		contrib: null,
		gateHook: null,
		tdd: [],
		...params,
	}
}

/** One part of a gate run as its event lists it (compact: only what differs from the defaults). */
export function partOf(params: {
	name: string
	status?: string
	reused?: boolean
	rerun?: boolean
	failing?: string[]
	heavy?: boolean
	durationMs?: number
}): Record<string, unknown> {
	return {
		name: params.name,
		status: params.status ?? 'passed',
		durationMs: params.durationMs ?? 1000,
		...(params.heavy === true ? { heavy: true } : {}),
		...(params.reused === true ? { reused: true } : {}),
		...(params.rerun === true ? { rerun: true } : {}),
		...(params.failing === undefined ? {} : { failing: params.failing }),
	}
}
