/** The stalled-run rule's cases: repositories of lots whose events are written as whole envelopes, no file, no process. */
import { pairRuns } from '../src/lib/events/pair-runs.ts'
import {
	NOW,
	OTHER_STALL_LOT,
	STALL_COMMON,
	STALL_FOLDER_ROOT,
	STALL_LOT,
	STALL_PID,
	STALL_WORKTREE,
} from './health-stall.constants.ts'
import { REPOSITORY_FOLDER } from './health.constants.ts'

import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { HealthFinding, HealthLot, HealthRepository } from '../src/lib/health/health.types.ts'
import type {
	StallEndParams,
	StallEventParams,
	StallFindingParams,
	StallLotSpec,
	StationEventParams,
} from './health-stall.types.ts'

function envelopeOf(params: { id: string; at: string; kind: string; pid: number }): LotEvent {
	return {
		schema: 1,
		id: params.id,
		at: params.at,
		lot: STALL_LOT,
		kind: params.kind,
		by: 'cli',
		pid: params.pid,
		cli: '0.7.0',
		simulated: false,
		hostEvent: null,
	}
}

/** The `step.start` of a run: pid `STALL_PID`, not heavy, in the lot's worktree, unless given. */
export function stepStartOf(params: StallEventParams): LotEvent {
	const { run, step, at, pid = STALL_PID, heavy = false, worktree = STALL_WORKTREE } = params
	return {
		...envelopeOf({ id: `${run}-start`, at, kind: 'step.start', pid }),
		run,
		step,
		heavy,
		worktree,
		throwaway: false,
	}
}

/** The `step.end` of a run: passed (exit 0) unless `outcome` or `exit` say otherwise. */
export function stepEndOf(params: StallEndParams): LotEvent {
	const { exit = 0, outcome, durationMs } = params
	return {
		...stepStartOf(params),
		id: `${params.run}-end`,
		kind: 'step.end',
		exit,
		durationMs,
		stateHash: null,
		reuse: 'none',
		...(outcome === undefined ? {} : { outcome }),
	}
}

/** A station start or end of a run. */
export function stationEventOf(params: StationEventParams): LotEvent {
	return {
		...envelopeOf({
			id: `${params.run}-${params.kind}`,
			at: params.at,
			kind: params.kind,
			pid: STALL_PID,
		}),
		run: params.run,
		station: params.station,
	}
}

/** The time `milliseconds` before `at`. */
export function beforeNow(params: { now: Date; milliseconds: number }): string {
	return new Date(params.now.getTime() - params.milliseconds).toISOString()
}

/** The folder of a lot of the scratch repository. */
export function stallFolderOf(name: string): string {
	return `${STALL_FOLDER_ROOT}/${name}`
}

function lotOf(params: { spec: StallLotSpec; index: number }): HealthLot {
	const { spec, index } = params
	const name = spec.name ?? (index === 0 ? STALL_LOT : OTHER_STALL_LOT)
	const state = 'state' in spec ? spec.state : 'working'
	return {
		name,
		folder: stallFolderOf(name),
		events: spec.events,
		runs: pairRuns({ events: spec.events }).runs,
		...(state === undefined ? {} : { state }),
	}
}

/** A repository of the lots given (no record); the first is `STALL_LOT`, the second `OTHER_STALL_LOT`. */
export function stallRepositoryOf(params: { lots: StallLotSpec[] }): HealthRepository {
	return {
		name: REPOSITORY_FOLDER,
		common: STALL_COMMON,
		lots: params.lots.map((spec, index) => lotOf({ spec, index })),
		records: [],
	}
}

/** A finding of the rule: `stalled-run`, the scratch repository, no detail unless given. */
export function stallFinding(params: StallFindingParams): HealthFinding {
	return {
		rule: 'stalled-run',
		severity: params.severity,
		repository: REPOSITORY_FOLDER,
		lot: params.lot ?? STALL_LOT,
		at: params.at,
		text: params.text,
		detail: params.detail ?? [],
		...(params.next === undefined ? {} : { next: params.next }),
	}
}

/** The time `milliseconds` before the scratch clock. */
export function gone(milliseconds: number): string {
	return beforeNow({ now: NOW, milliseconds })
}

/** The text of a red finding for a start whose process is gone. */
export function GONE_TEXT(params: { step: string; at: string; pid?: number }): string {
	return `${params.step} stalled: started ${params.at}, pid ${params.pid ?? STALL_PID} is gone`
}

/** The events of one run that has started and not ended. */
export function openRun(params: { step: string; at: string; heavy?: boolean }): LotEvent[] {
	return [stepStartOf({ run: 'run-open', ...params })]
}

/** A `scope.changed` event: an add of `src/`, with no run fields. */
export function scopeChangedOf(params: { at: string }): LotEvent {
	return {
		...envelopeOf({
			id: `scope-${params.at}`,
			at: params.at,
			kind: 'scope.changed',
			pid: STALL_PID,
		}),
		op: 'add',
		paths: ['src/'],
	}
}
