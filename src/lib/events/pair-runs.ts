import { RUN_END_KINDS, RUN_START_KINDS } from './events.constants.ts'

import type { EventRun, LotEvent, PairRunsResult } from './event.types.ts'

/**
 * Pairs starts and ends by `run`; keeps the first `end` of a run and the first event of a `hostEvent`, counting the
 * rest as `duplicates`. Takes the events sorted (as `readEvents` gives them); an event without a `run` is kept and
 * opens no run.
 */
export function pairRuns(params: { events: LotEvent[] }): PairRunsResult {
	const result: PairRunsResult = { events: [], runs: [], duplicates: 0 }
	const runs = new Map<string, EventRun>()
	const hostEvents = new Set<string>()
	for (const event of params.events) {
		if (event.hostEvent !== null && event.hostEvent !== undefined) {
			if (hostEvents.has(event.hostEvent)) {
				result.duplicates += 1
				continue
			}
			hostEvents.add(event.hostEvent)
		}
		const side = runSideOf({ event })
		if (side === undefined || typeof event.run !== 'string') {
			result.events.push(event)
			continue
		}
		const run = runOf({ runs, run: event.run })
		if (run[side] !== undefined) {
			result.duplicates += 1
			continue
		}
		run[side] = event
		result.events.push(event)
	}
	result.runs = [...runs.values()]
	return result
}

/** The runs whose events' kind starts with the prefix (`station.` or `step.`), in their order. */
export function runsOfKind(params: { runs: readonly EventRun[]; prefix: string }): EventRun[] {
	return params.runs.filter((run) => firstEventOf({ run }).kind.startsWith(params.prefix))
}

/** The first event a run holds: its start, else its end (a run always holds one). */
export function firstEventOf(params: { run: EventRun }): LotEvent {
	return (params.run.start ?? params.run.end) as LotEvent
}

/** Which side of a run an event is: `start`, `end`, or undefined for a kind that is neither. */
function runSideOf(params: { event: LotEvent }): 'start' | 'end' | undefined {
	if (RUN_START_KINDS.includes(params.event.kind)) return 'start'
	return RUN_END_KINDS.includes(params.event.kind) ? 'end' : undefined
}

/** The run of that name, made empty the first time it is named. */
function runOf(params: { runs: Map<string, EventRun>; run: string }): EventRun {
	const found = params.runs.get(params.run)
	if (found !== undefined) return found
	const made: EventRun = { run: params.run, start: undefined, end: undefined }
	params.runs.set(params.run, made)
	return made
}
