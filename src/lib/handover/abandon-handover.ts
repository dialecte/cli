/**
 * The logic of `handover abandon` as a library function (33S section 7, `lot stop` step 2): marks a hand-over that
 * will not run, records it abandoned and releases the lock naming it. `handover abandon` and `lot stop` both run it.
 */
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import {
	abandonedMarkerPath,
	readAbandonedMarker,
	writeAbandonedMarker,
} from './handover-abandoned-marker.ts'
import { handoverLockPath, readLockFile } from './handover-lock.ts'
import { readRunMarker, runningRefusal } from './handover-run-marker.ts'
import { findHandoverStore, recordHandoverState, registeredEntryOf } from './handover-store.ts'
import {
	COMMIT_SCRIPT_FILE,
	HANDOVER_ABANDON_TEXTS,
	HANDOVER_INTERLEAVING_REFUSALS,
} from './handover.constants.ts'
import { handoverState } from './list-handovers.ts'
import { readHandoverFolder } from './read-handover-folder.ts'

import type {
	AbandonHandoverParams,
	AbandonHandoverResult,
	LockRelease,
} from './abandon-handover.types.ts'
import type { HandoverRunMarker } from './handover.types.ts'

/**
 * Abandons the hand-over in `folder`: `abandoned.json` at `now`, its registry entry `abandoned`, the repository's
 * lock removed when it names the hand-over's script. Refused while a live run of it is marked (a run that crosses
 * the write takes the marker back) and once every lot is committed. A folder abandoned already: `already`, the
 * marker kept, and an entry still `pending` (a kill between the marker and the record) recorded `abandoned` with
 * the lock released likewise. Never touches the index, a ref or a commit.
 */
export function abandonHandover(params: AbandonHandoverParams): AbandonHandoverResult {
	const handover = readHandoverFolder(params.folder)
	if (typeof handover === 'string') return { state: 'refused', message: handover, released: false }
	const { folder } = handover
	const repository = params.repository ?? handover.lotsFile.repository
	const store = params.registry ?? findHandoverStore(repository)
	const lock = lockPathOf({ lockPath: params.lockPath, repository })
	const abandoned = readAbandonedMarker(folder)
	if (abandoned) {
		const already = HANDOVER_ABANDON_TEXTS.already
			.replace('{folder}', folder)
			.replace('{at}', abandoned.at)
		if (store === undefined || registeredEntryOf({ store, folder })?.state !== 'pending')
			return { state: 'already', message: already, released: false }
		// the repair waits for a live run as the abandon itself does: the run decides
		const running = readRunMarker(folder)
		if (running) return refusedWhileRunning({ folder, running })
		return { state: 'already', ...recordAbandoned({ store, folder, lock, first: already }) }
	}
	const running = readRunMarker(folder)
	if (running) return refusedWhileRunning({ folder, running })
	if (handoverState(handover) === 'committed')
		return {
			state: 'refused',
			message: HANDOVER_ABANDON_TEXTS.committed.replace('{folder}', folder),
			released: false,
		}
	params.afterCheck?.()
	writeAbandonedMarker({ folder, now: params.now })
	// a run that checked before this marker existed: it goes on, so the abandon is taken back
	const crossed = readRunMarker(folder)
	if (crossed) {
		rmSync(abandonedMarkerPath(folder))
		return {
			state: 'refused',
			message: runningRefusal({
				template: HANDOVER_INTERLEAVING_REFUSALS.abandon,
				folder,
				running: crossed,
			}),
			released: false,
		}
	}
	return {
		state: 'abandoned',
		...recordAbandoned({
			store,
			folder,
			lock,
			first: HANDOVER_ABANDON_TEXTS.abandoned.replace('{folder}', folder),
		}),
	}
}

/** The refusal of an abandon while the run `running` of `folder` is in progress. */
function refusedWhileRunning(params: {
	folder: string
	running: HandoverRunMarker
}): AbandonHandoverResult {
	return {
		state: 'refused',
		message: runningRefusal({ template: HANDOVER_ABANDON_TEXTS.running, ...params }),
		released: false,
	}
}

/** Records `folder` abandoned in `store` and releases `lock` when it names it: `first`, then the lock line. */
function recordAbandoned(params: {
	store: string | undefined
	folder: string
	lock: string | undefined
	first: string
}): Omit<AbandonHandoverResult, 'state'> {
	const { folder } = params
	recordHandoverState({ store: params.store, folder, state: 'abandoned' })
	const lock = releaseLockOf({ lock: params.lock, folder })
	return {
		message: [params.first, ...lock.lines].join('\n'),
		lines: [params.first, ...lock.lines],
		released: lock.released,
		lockLines: lock.lines,
	}
}

/**
 * The lock file the abandon may release: the one given, else the repository's (none when the repository is gone).
 */
function lockPathOf(params: {
	lockPath: string | undefined
	repository: string
}): string | undefined {
	if (params.lockPath !== undefined) return params.lockPath
	return existsSync(params.repository) ? handoverLockPath(params.repository) : undefined
}

/** The lock file `lock` removed when it names the script of `folder`; one line saying what became of it. */
function releaseLockOf(params: { lock: string | undefined; folder: string }): LockRelease {
	const { lock } = params
	const script = lock === undefined ? undefined : readLockFile(lock)
	if (lock === undefined || !script) return { lines: [], released: false }
	if (realPathOf(script) !== realPathOf(join(params.folder, COMMIT_SCRIPT_FILE)))
		return {
			lines: [HANDOVER_ABANDON_TEXTS.lockKept.replace('{lock}', lock).replace('{script}', script)],
			released: false,
		}
	rmSync(lock)
	return { lines: [HANDOVER_ABANDON_TEXTS.lockReleased.replace('{lock}', lock)], released: true }
}
