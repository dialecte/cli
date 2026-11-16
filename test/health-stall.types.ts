import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { HealthFinding } from '../src/lib/health/health.types.ts'
import type { DAMAGED_STATE } from '../src/lib/store/store.constants.ts'
import type { LotStateName } from '../src/lib/store/store.types.ts'

/** A step event of a run: the run, the step and the time; the process, the heaviness and the worktree have defaults. */
export type StallEventParams = {
	run: string
	step: string
	at: string
	pid?: number
	heavy?: boolean
	worktree?: string
}

/** A step end: the end of the run, with how long it took, and how it ended. */
export type StallEndParams = StallEventParams & {
	durationMs: number
	outcome?: 'interrupted'
	exit?: number
}

/** A station event of a run. */
export type StationEventParams = {
	kind: 'station.start' | 'station.end'
	run: string
	station: string
	at: string
}

/** One lot of a case: its state (`working` unless given; `undefined` for a lot with no state) and its events in time order. */
export type StallLotSpec = {
	name?: string
	state?: LotStateName | typeof DAMAGED_STATE | undefined
	events: LotEvent[]
}

/** One case of the rule: the lots, the pids that are alive, the clock, the findings. */
export type StallCase = {
	name: string
	lots: StallLotSpec[]
	/** Whether every process is alive (false by default: the pids are gone). */
	alive?: boolean
	now?: Date
	expected: HealthFinding[]
}

/** A finding of the rule, of the case's lot unless `lot` is given. */
export type StallFindingParams = {
	severity: 'red' | 'amber'
	at: string
	text: string
	detail?: string[]
	next?: string
	lot?: string
}
