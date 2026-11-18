/** The hand-over run alive in a repository, or in a rehearsal clone. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { gitFolderOf } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { isProcessAlive } from '../process-alive.ts'
import { processStartTime } from '../process-start-time.ts'
import { readHandoverLock } from './handover-lock.ts'
import { readRunMarker } from './handover-run-marker.ts'
import { REHEARSAL_MARKER_FILE } from './handover.constants.ts'
import { REHEARSAL_RUN_UNKNOWN } from './live-handover-run.constants.ts'

import type { LiveHandoverRun, RehearsalRun } from './live-handover-run.types.ts'

/**
 * The hand-over run alive in the worktree `root`: the folder the hand-over lock names when its run marker names a
 * live process; else, in a rehearsal clone, the folder its rehearsal marker names when the marker's owner runs with
 * the start time the marker holds (a `--keep` clone's leftover marker, a reused pid, a marker without `handover` or
 * `startTime` read as no run). Undefined when neither.
 */
export function readLiveHandoverRun(root: string): LiveHandoverRun | undefined {
	const script = readHandoverLock(root)
	if (script !== undefined) {
		const folder = dirname(script)
		if (readRunMarker(folder) !== undefined) return { folder }
	}
	const run = readRehearsalRun({ markerPath: join(gitFolderOf(root), REHEARSAL_MARKER_FILE) })
	return run.state === 'alive' && run.handover !== undefined ? { folder: run.handover } : undefined
}

/**
 * The rehearsal marker at `markerPath` read three ways: `unknown` with why when there is no marker, it does not parse,
 * it names no pid, or a running pid's start time cannot be compared (none in the marker, none read); `dead` when the
 * pid runs no more, or runs with another start time (a reused pid); else `alive`, with the hand-over folder it names.
 *
 * @intent tell a live rehearsal from a dead one, and say when it cannot tell
 * @internal
 */
export function readRehearsalRun(params: {
	markerPath: string
	/** Reads a pid's start time; default `processStartTime` (the tests stand in for it). */
	readStartTime?: (pid: number) => string | undefined
}): RehearsalRun {
	const { markerPath } = params
	if (!existsSync(markerPath))
		return { state: 'unknown', why: REHEARSAL_RUN_UNKNOWN.noMarker, pid: undefined }
	let marker: unknown
	try {
		marker = JSON.parse(readFileSync(markerPath, 'utf8'))
	} catch {
		return { state: 'unknown', why: REHEARSAL_RUN_UNKNOWN.unparsable, pid: undefined }
	}
	if (
		typeof marker !== 'object' ||
		marker === null ||
		!('pid' in marker) ||
		typeof marker.pid !== 'number'
	)
		return { state: 'unknown', why: REHEARSAL_RUN_UNKNOWN.noPid, pid: undefined }
	const { pid } = marker
	if (!isProcessAlive(pid)) return { state: 'dead', pid }
	const recorded =
		'startTime' in marker && typeof marker.startTime === 'string' ? marker.startTime : undefined
	if (recorded === undefined)
		return {
			state: 'unknown',
			why: fillMessage({
				template: REHEARSAL_RUN_UNKNOWN.noStartTime,
				values: { pid: String(pid) },
			}),
			pid,
		}
	const started = (params.readStartTime ?? processStartTime)(pid)
	if (started === undefined)
		return {
			state: 'unknown',
			why: fillMessage({
				template: REHEARSAL_RUN_UNKNOWN.unreadableStartTime,
				values: { pid: String(pid) },
			}),
			pid,
		}
	if (started !== recorded) return { state: 'dead', pid }
	return {
		state: 'alive',
		pid,
		handover:
			'handover' in marker && typeof marker.handover === 'string' ? marker.handover : undefined,
	}
}
