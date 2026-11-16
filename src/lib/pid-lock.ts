/**
 * The parts every lock file of the cli shares, whatever else its text names: created exclusively, read as bytes,
 * its writer told running or gone by pid and start time, and a stale one set aside so that of two takers one wins.
 */
import { linkSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'

import { LINE_FEED } from './print/print.constants.ts'
import { isProcessAlive } from './process-alive.ts'
import { processStartTime } from './process-start-time.ts'

import type { LockWriter } from './pid-lock.types.ts'

// this process's start time once read: undefined until then
let ownStart: { started: string | undefined } | undefined

/** Creates the lock file holding `text`; false when one is there. */
export function createLockFile(params: { lockPath: string; text: string }): boolean {
	try {
		writeFileSync(params.lockPath, params.text, { flag: 'wx' })
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
		return false
	}
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

/** This process's start time as `processStartTime` reads it, asked of `ps` once: it never changes while the process runs. */
export function ownProcessStartTime(): string | undefined {
	ownStart ??= { started: processStartTime(process.pid) }
	return ownStart.started
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
