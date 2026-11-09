/** The hand-over run alive in a repository, or in a rehearsal clone. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { gitFolderOf } from '../git.ts'
import { isProcessAlive } from '../process-alive.ts'
import { processStartTime } from '../process-start-time.ts'
import { readHandoverLock } from './handover-lock.ts'
import { readRunMarker } from './handover-run-marker.ts'
import { REHEARSAL_MARKER_FILE } from './handover.constants.ts'

import type { LiveHandoverRun } from './live-handover-run.types.ts'

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
	return readRehearsalRun(join(gitFolderOf(root), REHEARSAL_MARKER_FILE))
}

/** The folder a rehearsal marker names, when its owner is alive with the start time it holds. */
function readRehearsalRun(markerPath: string): LiveHandoverRun | undefined {
	if (!existsSync(markerPath)) return undefined
	let marker: unknown
	try {
		marker = JSON.parse(readFileSync(markerPath, 'utf8'))
	} catch {
		// a marker being written, or broken: no run
		return undefined
	}
	if (typeof marker !== 'object' || marker === null) return undefined
	if (!('pid' in marker) || typeof marker.pid !== 'number') return undefined
	if (!('handover' in marker) || typeof marker.handover !== 'string') return undefined
	if (!('startTime' in marker) || typeof marker.startTime !== 'string') return undefined
	if (!isProcessAlive(marker.pid) || processStartTime(marker.pid) !== marker.startTime)
		return undefined
	return { folder: marker.handover }
}
