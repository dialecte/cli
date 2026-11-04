/**
 * While a hand-over script waits for a human or runs, nothing else may touch the repository's index:
 * the hand-over writes a lock in the worktree's git folder naming its script, the script removes it
 * after its last commit. `dialecte gate` runs under it only when the lock names a hand-over written for
 * this repository (its lots file names this repository) and no real run of it is in progress; else it
 * refuses.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { gitFolderOf, readGit } from '../git.ts'
import { readRunMarker, runningRefusal } from './handover-run-marker.ts'
import {
	HANDOVER_FILES,
	HANDOVER_HOLD_REASONS,
	HANDOVER_HOLD_REFUSAL,
	HANDOVER_LOCK_FILE,
	HANDOVER_RUNNING_REFUSAL,
} from './handover.constants.ts'
import { readLotsFile } from './read-lots-file.ts'

import type { HandoverHold } from './handover.types.ts'

export function handoverLockPath(root: string): string {
	return join(gitFolderOf(root), HANDOVER_LOCK_FILE)
}

/** The script holding the repository, or undefined when none does. */
export function readHandoverLock(root: string): string | undefined {
	const lockPath = handoverLockPath(root)
	return existsSync(lockPath) ? readFileSync(lockPath, 'utf8').trim() : undefined
}

/** The refusal naming the script holding the repository and its lock, with why it is not this tree's. */
export function handoverHoldRefusal(params: { script: string; lock: string; why: string }): string {
	return HANDOVER_HOLD_REFUSAL.replace('{script}', params.script)
		.replace('{why}', params.why)
		.replace('{lock}', params.lock)
}

/**
 * Whether a gate in `root` may run while the hand-over lock is held: under the hand-over the lock names when
 * its script exists, the lots file beside it names this repository (real paths compared) and its run marker
 * names no live process; refused otherwise.
 */
export function readHandoverHold(root: string): HandoverHold {
	const script = readHandoverLock(root)
	if (script === undefined) return { held: false }
	const holder = { script, lock: handoverLockPath(root) }
	function refusedFor(why: string): HandoverHold {
		return { held: true, refusal: handoverHoldRefusal({ ...holder, why }) }
	}
	if (!existsSync(script)) return refusedFor(HANDOVER_HOLD_REASONS.scriptGone)
	const folder = dirname(script)
	const lotsFile = readLotsFile(join(folder, HANDOVER_FILES.lots))
	if (typeof lotsFile === 'string')
		return refusedFor(HANDOVER_HOLD_REASONS.noLotsFile.replace('{reason}', lotsFile))
	const repository = readGit({ root, args: ['rev-parse', '--show-toplevel'] }).trim()
	if (realPathOf(lotsFile.repository) !== realPathOf(repository))
		return refusedFor(
			HANDOVER_HOLD_REASONS.otherRepository.replace('{repository}', lotsFile.repository),
		)
	const running = readRunMarker(folder)
	if (running)
		return {
			held: true,
			refusal: runningRefusal({ template: HANDOVER_RUNNING_REFUSAL, folder, running }),
		}
	return { held: true, folder }
}
