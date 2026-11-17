/**
 * The fetch lock: `fetch.lock` in the cache holds the process id of the fetch writing it. A second fetch while that
 * process runs is refused; a lock whose process is gone (a fetch killed) is taken over; a lock holding no id is refused.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FETCH_LOCK_FILE } from './corpus.constants.ts'

import type { FetchLock } from './corpus.types.ts'

export function fetchLockFileOf(params: { cache: string }): string {
	return join(params.cache, FETCH_LOCK_FILE)
}

/**
 * Takes the cache's fetch lock for this process, or says why not: another running process holds it, or the lock holds
 * no process id (never taken over: it is the person's to remove). A lock whose process is gone is removed and taken
 * with one more exclusive create, so two runs taking over the same stale lock never both hold it.
 */
export function acquireFetchLock(params: { cache: string }): FetchLock {
	const file = fetchLockFileOf(params)
	if (createdExclusively(file)) return { kind: 'acquired' }
	const holder = holderOf(file)
	if (holder === undefined) return { kind: 'unreadable' }
	if (isRunning(holder)) return { kind: 'held', pid: holder }
	rmSync(file, { force: true })
	if (createdExclusively(file)) return { kind: 'acquired' }
	const taker = holderOf(file)
	return taker === undefined ? { kind: 'unreadable' } : { kind: 'held', pid: taker }
}

/** Removes the lock when it still holds this process's id: a lock taken over since is the other run's. */
export function releaseFetchLock(params: { cache: string }): void {
	const file = fetchLockFileOf(params)
	if (existsSync(file) && holderOf(file) === process.pid) rmSync(file, { force: true })
}

/** Whether this process created the lock file, holding its id; false when the file is there already. */
function createdExclusively(file: string): boolean {
	try {
		writeFileSync(file, `${process.pid}\n`, { flag: 'wx' })
		return true
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false
		throw error
	}
}

/** The process id the lock holds; undefined when it holds none (empty, not a number) or is gone. */
function holderOf(file: string): number | undefined {
	try {
		const text = readFileSync(file, 'utf8').trim()
		const pid = Number(text)
		return text !== '' && Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
	} catch {
		return undefined
	}
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
