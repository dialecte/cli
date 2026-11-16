import { isSameKey } from '../gate-records/check-records.ts'
import { RECORD_EVENT_SLACK_MS, STEP_FAMILY_OF_MODE } from './health.constants.ts'

import type { LotEvent } from '../events/event.types.ts'
import type { CheckKey, GateRecord } from '../gate-records/gate-records.types.ts'
import type { ClosedLotRun, HealthLot, LotRun } from './health.types.ts'

/** Every run of the lots that ended, with its lot's folder name, in time order of the ends. */
export function collectLotRuns(params: { lots: readonly HealthLot[] }): LotRun[] {
	const runs: LotRun[] = []
	for (const lot of params.lots) {
		for (const run of lot.runs) {
			if (run.end !== undefined) runs.push({ lot: lot.name, start: run.start, end: run.end })
		}
	}
	return runs.sort((first, second) => timeOf(first.end.at) - timeOf(second.end.at))
}

/**
 * The run that wrote the record: a run of the record mode's step that started at or before the record's time and
 * ended at most `RECORD_EVENT_SLACK_MS` before it, whose end carries the record's key when it carries one; the one
 * whose end is closest to the record's time when several do.
 */
export function findRecordRun(params: {
	record: GateRecord
	runs: readonly LotRun[]
}): ClosedLotRun | undefined {
	const { record } = params
	const step = STEP_FAMILY_OF_MODE[record.mode]
	const recordAt = timeOf(record.at)
	let found: ClosedLotRun | undefined
	for (const run of params.runs) {
		if (!isClosedRun(run) || run.end.step !== step) continue
		if (timeOf(run.start.at) > recordAt) continue
		if (timeOf(run.end.at) + RECORD_EVENT_SLACK_MS < recordAt) continue
		const key = eventKeyOf({ event: run.end })
		if (key !== undefined && !isSameKey({ key, other: record.key })) continue
		if (
			found === undefined ||
			distanceOf({ run, at: recordAt }) < distanceOf({ run: found, at: recordAt })
		)
			found = run
	}
	return found
}

/** How long a run took: its end's `durationMs`, else the time between its start and its end (0 with no start). */
export function runDurationMs(params: { run: LotRun }): number {
	const { start, end } = params.run
	if (typeof end.durationMs === 'number') return end.durationMs
	return start === undefined ? 0 : timeOf(end.at) - timeOf(start.at)
}

/** The check key an event carries, when it carries a whole one. */
export function eventKeyOf(params: { event: LotEvent }): CheckKey | undefined {
	const { key } = params.event
	return isCheckKey(key) ? key : undefined
}

/** The milliseconds of an ISO 8601 time. */
export function timeOf(at: string): number {
	return Date.parse(at)
}

/** The time is in the window, both ends included. */
export function isInWindow(params: { at: string; since: Date; now: Date }): boolean {
	const at = timeOf(params.at)
	return at >= params.since.getTime() && at <= params.now.getTime()
}

export function isClosedRun(run: LotRun): run is ClosedLotRun {
	return run.start !== undefined
}

function distanceOf(params: { run: LotRun; at: number }): number {
	return Math.abs(timeOf(params.run.end.at) - params.at)
}

function isCheckKey(value: unknown): value is CheckKey {
	return (
		typeof value === 'object' &&
		value !== null &&
		'tree' in value &&
		typeof value.tree === 'string' &&
		'lockHash' in value &&
		typeof value.lockHash === 'string' &&
		'commandHash' in value &&
		typeof value.commandHash === 'string' &&
		'linked' in value &&
		typeof value.linked === 'string'
	)
}
