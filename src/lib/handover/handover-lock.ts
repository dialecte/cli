/**
 * While a hand-over script waits for a human or runs, nothing else may touch the repository's index:
 * the hand-over writes a lock in the worktree's git folder naming its script, the script removes it
 * after its last commit, and `dialecte gate` refuses to run while it is there.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { gitFolderOf } from '../git.ts'
import { HANDOVER_LOCK_FILE } from './handover.constants.ts'

export function handoverLockPath(root: string): string {
	return join(gitFolderOf(root), HANDOVER_LOCK_FILE)
}

/** The script holding the repository, or undefined when none does. */
export function readHandoverLock(root: string): string | undefined {
	const lockPath = handoverLockPath(root)
	return existsSync(lockPath) ? readFileSync(lockPath, 'utf8').trim() : undefined
}
