/**
 * The fetch lock: `fetch.lock` in the cache holds the process id of the fetch writing it. A second fetch while that
 * process runs is refused; a lock whose process is gone (a fetch killed) is taken over.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FETCH_LOCK_FILE } from './corpus.constants.ts'

import type { FetchLock } from './corpus.types.ts'

export function fetchLockFileOf(params: { cache: string }): string {
	return join(params.cache, FETCH_LOCK_FILE)
}

/** Takes the cache's fetch lock for this process, or names the running process that holds it. */
export function acquireFetchLock(params: { cache: string }): FetchLock {
	const file = fetchLockFileOf(params)
	try {
		writeFileSync(file, `${process.pid}\n`, { flag: 'wx' })
		return { kind: 'acquired' }
	} catch (error) {
		if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
	}
	const holder = Number.parseInt(readFileSync(file, 'utf8').trim(), 10)
	if (Number.isInteger(holder) && isRunning(holder)) return { kind: 'held', pid: holder }
	writeFileSync(file, `${process.pid}\n`)
	return { kind: 'acquired' }
}

export function releaseFetchLock(params: { cache: string }): void {
	rmSync(fetchLockFileOf(params), { force: true })
}

/** Whether a process with this id runs (one this user may not signal runs too). */
function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return error instanceof Error && 'code' in error && error.code === 'EPERM'
	}
}
