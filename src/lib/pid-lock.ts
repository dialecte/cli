/**
 * The parts every lock file of the cli shares, whatever else its text names: created exclusively, read as bytes,
 * its writer told running or gone by pid and start time, and a stale one set aside so that of two takers one wins.
 */
import { randomUUID } from 'node:crypto'
import { linkSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'

import { LOCK_WRITE_SUFFIX } from './pid-lock.constants.ts'
import { LINE_FEED } from './print/print.constants.ts'
import { isProcessAlive } from './process-alive.ts'
import { processStartTime } from './process-start-time.ts'

import type { LockWriter } from './pid-lock.types.ts'

/**
 * Creates the lock file holding `text`; false when one is there. The text is written beside it first, then linked
 * into place (exclusive and atomic): another taker never reads the lock empty and judges it stale.
 */
export function createLockFile(params: { lockPath: string; text: string }): boolean {
	const written = writeBeside(params)
	try {
		linkSync(written, params.lockPath)
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
		return false
	} finally {
		rmSync(written, { force: true })
	}
}

/** Puts `text` in the lock file in place of what it holds: written beside it, then renamed over it, never seen empty. */
export function replaceLockFile(params: { lockPath: string; text: string | Buffer }): void {
	const written = writeBeside(params)
	try {
		renameSync(written, params.lockPath)
	} finally {
		rmSync(written, { force: true })
	}
}

/** `text` written to a file of its own beside the lock (a name no other writer uses): its path. */
function writeBeside(params: { lockPath: string; text: string | Buffer }): string {
	const written = `${params.lockPath}.${process.pid}-${randomUUID()}${LOCK_WRITE_SUFFIX}`
	writeFileSync(written, params.text)
	return written
}

/** The bytes of the lock file, or undefined when there is none. */
export function readLockBytes(lockPath: string): Buffer | undefined {
	try {
		return readFileSync(lockPath)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		return undefined
	}
}

/**
 * The writer a lock's text names: its pid on the line after the `fields` lines the lock holds first (its own data,
 * none by default), its start time on the next. A pid that is no positive integer, or an empty start time, is none.
 */
export function lockWriterOfText(params: { text: string; fields?: number }): LockWriter {
	const lines = params.text.trim().split(LINE_FEED)
	const at = params.fields ?? 0
	const pid = Number(lines[at])
	const started = lines[at + 1]
	return {
		pid: Number.isSafeInteger(pid) && pid > 0 ? pid : undefined,
		started: started === undefined || started === '' ? undefined : started,
	}
}

/**
 * The lock's writer still runs: its pid is alive and, when the lock holds a start time `ps` can compare, that pid
 * started then (another start time is a reused pid).
 */
export function isWriterRunning(writer: LockWriter): boolean {
	if (writer.pid === undefined || !isProcessAlive(writer.pid)) return false
	if (writer.started === undefined) return true
	const started = processStartTime(writer.pid)
	return started === undefined || started === writer.started
}

/**
 * Moves away the stale lock read as `found`, by a rename to `aside` (a name no other taker uses): true once it is
 * gone. False when another taker went first: its rename left nothing here, or what the rename caught is the lock
 * that taker made since, which goes back unless a lock is there again.
 */
export function setStaleLockAside(params: {
	lockPath: string
	found: Buffer
	aside: string
}): boolean {
	const { lockPath, aside } = params
	try {
		renameSync(lockPath, aside)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		return false
	}
	const stale = readFileSync(aside).equals(params.found)
	try {
		if (!stale) linkSync(aside, lockPath)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
	}
	rmSync(aside, { force: true })
	return stale
}
