/**
 * The machine's heavy load as `plan next` advises on it (33N section 7): the live heavy markers mapped to the
 * plan's entries through their worktree's branch, and why the machine is short, when it is.
 */
import { basename, resolve } from 'node:path'

import { readLiveHeavyMarkers } from '../events/heavy-markers.ts'
import { shortnessOf } from '../heavy/machine-load.ts'
import { CLOCK_DIGITS, STEP_TEXTS } from './plan.constants.ts'

import type { EntryStatus, PlanStates } from './entry-state.types.ts'
import type { ReadPlanHeavyParams } from './plan-heavy.types.ts'
import type { PlanHeavyReading } from './propose.types.ts'

/**
 * The live markers (a pid that runs with the start time its marker holds), each with its step, the folder name of
 * its worktree, its start and the entry its worktree's branch belongs to (else null), in start order; and the
 * reasons the machine is short.
 */
export function readPlanHeavy(params: ReadPlanHeavyParams): PlanHeavyReading {
	const read = liveMarkersOf(params)
	const markers = 'unknown' in read ? [] : read.markers
	return {
		...('unknown' in read && { markersUnknown: read.unknown }),
		markers: markers.map((marker) => ({
			step: marker.step,
			worktree: basename(marker.worktree),
			since: marker.started,
			entry: entryOfWorktree({ worktree: marker.worktree, states: params.states }),
		})),
		shortReasons: shortnessOf({ machine: params.machine }).reasons,
	}
}

/**
 * The live heavy markers, or why they cannot be read (a damaged state folder: `<state>/dialecte/heavy` a file, an
 * unreadable folder): advice only, so it never throws out of `plan next`.
 */
function liveMarkersOf(
	params: ReadPlanHeavyParams,
): { markers: ReturnType<typeof readLiveHeavyMarkers> } | { unknown: string } {
	try {
		return { markers: readLiveHeavyMarkers({ ...params.location, check: params.check }) }
	} catch (error) {
		return { unknown: (error as Error).message }
	}
}

/** How a marker's step is said: `gate --full`, `gate --release`, any other step as it is. */
export function stepTextOf(params: { step: string }): string {
	return STEP_TEXTS[params.step] ?? params.step
}

/** The local clock time of an ISO time (`10:02`). */
export function clockTimeOf(params: { time: string }): string {
	const date = new Date(params.time)
	return [date.getHours(), date.getMinutes()]
		.map((part) => String(part).padStart(CLOCK_DIGITS, '0'))
		.join(':')
}

/**
 * The entry open in the worktree (its folder compared as a resolved path, never by name): the entry the worktree
 * is attributed to first, else an entry open by a record naming that worktree; a done entry never.
 */
function entryOfWorktree(params: { worktree: string; states: PlanStates }): string | null {
	const path = resolve(params.worktree)
	const open = params.states.entries.filter(
		(status) =>
			status.state === 'open' &&
			status.realizedBy?.worktree !== null &&
			status.realizedBy?.worktree !== undefined &&
			resolve(status.realizedBy.worktree) === path,
	)
	const attributed = open.find(isAttributedToWorktree)
	return (attributed ?? open[0])?.id ?? null
}

/** The entry is open by its worktree alone (the shared-branch attribution). */
function isAttributedToWorktree(status: EntryStatus): boolean {
	return status.realizedBy?.kind === 'worktree'
}
