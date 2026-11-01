/**
 * One heavy run at a time on a machine (a full gate, a browser suite): the lock is a file in the user's
 * cache folder naming its holder (pid, command, start time). A holder whose process is gone left a stale
 * lock, taken over. A second caller waits, with a line every 30 s naming the holder, or refuses at once.
 * The holder's own process takes it again for free (a heavy step inside a full gate), and so does a
 * process whose `DIALECTE_MACHINE_LOCK_HOLDER` names the live holder by its pid and its process start
 * (`<pid>:<start>`, a command `lock run` runs): its release leaves the lock to that holder.
 */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { linkSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { isProcessAlive } from '../process-alive.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { HEARTBEAT_INTERVAL_MILLISECONDS } from '../progress/progress.constants.ts'
import {
	BEING_WRITTEN_HOLDER,
	MACHINE_LOCK_FILE,
	MACHINE_LOCK_HOLDER_VARIABLE,
	MACHINE_LOCK_POLL_MILLISECONDS,
	STALE_FILE_MILLISECONDS,
	TAKEOVER_SUFFIX,
} from './machine-lock.constants.ts'

import type { WriteLine } from '../handover/handover.types.ts'
import type { Clock } from '../progress/clock.types.ts'
import type { MachineLockHolder, MachineLockOutcome, TakeoverStep } from './machine-lock.types.ts'

export function acquireMachineLock(params: {
	path: string
	command: string
	/** Wait for the holder (a line every 30 s); false: refuse at once. */
	wait: boolean
	clock: Clock
	write: WriteLine
	pid?: number
	isAlive?: (pid: number) => boolean
	/** When a process started (`ps -o lstart=`): a pid reused by another process is not the holder. */
	processStartOf?: (pid: number) => string | undefined
	/** Called at each step of a takeover (tests interleave other callers there). */
	onTakeoverStep?: (step: TakeoverStep) => void
}): MachineLockOutcome {
	const { path, clock } = params
	const pid = params.pid ?? process.pid
	const isAlive = params.isAlive ?? isProcessAlive
	const processStartOf = params.processStartOf ?? readProcessStart
	const holderVariable = process.env[MACHINE_LOCK_HOLDER_VARIABLE] ?? ''
	mkdirSync(dirname(path), { recursive: true })
	const waitStartedAt = clock.now()
	let lastLineAt: number | undefined
	for (;;) {
		const holder: MachineLockHolder = {
			pid,
			command: params.command,
			startedAt: new Date().toISOString(),
			processStart: processStartOf(pid),
		}
		const content = `${JSON.stringify(holder)}\n`
		const acquired = {
			acquired: true as const,
			holderVariable: holderVariableOf(holder),
			release: () => releaseIfHeld({ path, pid }),
		}
		if (createByLink({ path, content })) return acquired
		const current = readHolder(path)
		if (current === 'missing') continue
		if (
			typeof current === 'object' &&
			(current.pid === pid || (holderVariableOf(current) === holderVariable && !isStale(current)))
		)
			return {
				acquired: true,
				holderVariable: holderVariableOf(current),
				release: () => undefined,
			}
		function isStale(read: ReturnType<typeof readHolder>): boolean {
			if (read === 'missing') return false
			if (read === 'being written')
				return isOlderThan({ path, milliseconds: STALE_FILE_MILLISECONDS })
			return !isAlive(read.pid) || isReusedPid({ holder: read, processStartOf })
		}
		if (isStale(current)) {
			const takeover = takeOver({
				path,
				content,
				pid,
				isStillStale: (read) => sameHolder({ left: read, right: current }) && isStale(read),
				onStep: params.onTakeoverStep,
			})
			if (takeover === 'acquired') return acquired
			if (takeover === 'retry') continue
		}
		const shown = current === 'being written' ? BEING_WRITTEN_HOLDER : current
		if (!params.wait) return { acquired: false, holder: shown }
		if (lastLineAt === undefined || clock.now() - lastLineAt >= HEARTBEAT_INTERVAL_MILLISECONDS) {
			lastLineAt = clock.now()
			params.write(
				`… waiting ${formatDuration(clock.now() - waitStartedAt)} for the machine lock: ${describeHolder(shown)}`,
			)
		}
		clock.sleep(MACHINE_LOCK_POLL_MILLISECONDS)
	}
}

/**
 * The value of `DIALECTE_MACHINE_LOCK_HOLDER` naming a holder: `<pid>:<process start>`, so a pid reused by
 * another process does not match when the start is known (`<pid>:` when `ps` gave none: the pid alone).
 */
function holderVariableOf(holder: MachineLockHolder): string {
	return `${holder.pid}:${holder.processStart ?? ''}`
}

/** `pid 123 runs "dialecte gate --full" since <date>`. */
export function describeHolder(holder: MachineLockHolder): string {
	return `pid ${holder.pid} runs "${holder.command}" since ${holder.startedAt}`
}

/** The lock file: `$DIALECTE_CACHE_DIR`, else the user's cache folder of the platform. */
export function machineLockPath(): string {
	const environment = process.env
	const cacheFolder =
		environment.DIALECTE_CACHE_DIR ||
		(process.platform === 'darwin'
			? join(homedir(), 'Library', 'Caches', 'dialecte')
			: process.platform === 'win32' && environment.LOCALAPPDATA
				? join(environment.LOCALAPPDATA, 'dialecte')
				: join(environment.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'dialecte'))
	return join(cacheFolder, MACHINE_LOCK_FILE)
}

/**
 * The lock appears whole or not at all: its content is written to a file of this process first, then
 * linked into place (a link fails when the lock exists).
 */
function createByLink(params: { path: string; content: string }): boolean {
	const temporary = `${params.path}.${process.pid}.${randomUUID()}.tmp`
	writeFileSync(temporary, params.content)
	try {
		linkSync(temporary, params.path)
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
		throw error
	} finally {
		rmSync(temporary, { force: true })
	}
}

/**
 * Taking over a stale lock happens under a short takeover lock (`<path>.takeover`, created by link), so
 * two callers never both remove and recreate it: inside it, the lock is read again, checked stale again
 * (the same holder as read before), removed, and created for this caller. A takeover lock left by a
 * caller that died is cleared once its file is a few seconds old.
 */
function takeOver(params: {
	path: string
	content: string
	pid: number
	isStillStale: (read: ReturnType<typeof readHolder>) => boolean
	onStep?: (step: TakeoverStep) => void
}): 'acquired' | 'retry' | 'busy' {
	const { path } = params
	const takeoverPath = `${path}${TAKEOVER_SUFFIX}`
	if (!createByLink({ path: takeoverPath, content: `${params.pid}\n` })) {
		if (!isOlderThan({ path: takeoverPath, milliseconds: STALE_FILE_MILLISECONDS })) return 'busy'
		rmSync(takeoverPath, { force: true })
		return 'retry'
	}
	try {
		params.onStep?.('holding the takeover')
		if (!params.isStillStale(readHolder(path))) return 'retry'
		rmSync(path, { force: true })
		params.onStep?.('stale lock removed')
		return createByLink({ path, content: params.content }) ? 'acquired' : 'retry'
	} finally {
		rmSync(takeoverPath, { force: true })
	}
}

/** The same holder: the same pid and start, or both a file being written. */
function sameHolder(params: {
	left: ReturnType<typeof readHolder>
	right: ReturnType<typeof readHolder>
}): boolean {
	const { left, right } = params
	if (typeof left !== 'object' || typeof right !== 'object') return left === right
	return left.pid === right.pid && left.startedAt === right.startedAt
}

/** The file was last written more than `milliseconds` ago (false when it is gone). */
function isOlderThan(params: { path: string; milliseconds: number }): boolean {
	try {
		return Date.now() - statSync(params.path).mtimeMs > params.milliseconds
	} catch {
		return false
	}
}

/** The holder; `being written` for an empty or unreadable file; `missing` when there is none. */
function readHolder(path: string): MachineLockHolder | 'being written' | 'missing' {
	let text: string
	try {
		text = readFileSync(path, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
		throw error
	}
	try {
		const holder = JSON.parse(text) as MachineLockHolder
		return typeof holder?.pid === 'number' ? holder : 'being written'
	} catch {
		return 'being written'
	}
}

function releaseIfHeld(params: { path: string; pid: number }): void {
	const holder = readHolder(params.path)
	if (typeof holder === 'object' && holder.pid === params.pid) rmSync(params.path, { force: true })
}

/**
 * The holder's pid now belongs to a process started at another time. Only when both start times are
 * known: a `ps` that fails never makes a live holder look dead.
 */
function isReusedPid(params: {
	holder: MachineLockHolder
	processStartOf: (pid: number) => string | undefined
}): boolean {
	const recorded = params.holder.processStart
	if (recorded === undefined) return false
	const now = params.processStartOf(params.holder.pid)
	return now !== undefined && now !== recorded
}

/**
 * When the process started, as `ps` prints it in the C locale and UTC, so a holder and a waiter running
 * under other languages or time zones read the same string; undefined when `ps` answers nothing.
 */
function readProcessStart(pid: number): string | undefined {
	const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
		encoding: 'utf8',
		env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
	})
	const start = result.status === 0 ? result.stdout.trim() : ''
	return start || undefined
}
