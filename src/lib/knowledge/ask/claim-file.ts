import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { linkSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'

import { fillMessage } from '../standard/fill-message.ts'
import {
	CLAIM_LINE_SEPARATOR,
	CLAIM_MAX_HELD_MS,
	CLAIM_START_TOLERANCE_MS,
	PS_COMMAND,
	PS_LOCALE,
	PS_START_ARGUMENTS,
	STALE_CLAIM_SUFFIX,
	TAKEOVER_SUFFIX,
} from './ask.constants.ts'

import type { ClaimFileParams, ClaimHolder, StartTimes } from './ask.types.ts'

/**
 * Takes a claim file (D12, D40 c): an exclusive create holding this process's id. A claim already there is taken
 * over only when the process it names is gone AND it is older than `staleMs` (moved aside, removed, created again),
 * under the exclusive `<claim>.takeover` file (R2-4: while one is held nobody takes the claim; one left stale is taken
 * over itself); false while another holds it.
 */
export function claimFile(params: ClaimFileParams): boolean {
	const takeover = `${params.path}${TAKEOVER_SUFFIX}`
	// one start-time read per pid for this loop, or for the caller's whole wait (L-4)
	const starts = params.starts ?? startTimesOf({ psOutput: params.psOutput })
	for (;;) {
		// a takeover in its window (R2-4): nobody takes the claim until it ends; a stale one is taken over itself
		const taker = claimHolderOf({ path: takeover, starts })
		if (taker !== undefined) {
			if (isHeld({ holder: taker, staleMs: params.staleMs })) return false
			takenOver({ path: takeover, stalePid: taker.pid })
			continue
		}
		if (createdClaim({ path: params.path })) return true
		const holder = claimHolderOf({ path: params.path, starts })
		// the claim was released between the create and the read: try again
		if (holder === undefined) continue
		if (isHeld({ holder, staleMs: params.staleMs })) return false
		params.afterStaleRead?.()
		// the takeover runs under its own exclusive file: another taker at it leaves the claim to it
		if (!createdClaim({ path: takeover })) return false
		try {
			// read again under the lock (R2-4): only the stale claim read is ever moved, never a live one made since
			const again = claimHolderOf({ path: params.path, starts })
			if (
				again !== undefined &&
				(again.pid !== holder.pid || isHeld({ holder: again, staleMs: params.staleMs }))
			)
				return false
			if (again !== undefined) {
				takenOver({ path: params.path, stalePid: holder.pid })
				params.afterMovedAside?.()
			}
		} finally {
			releaseClaim({ path: takeover })
		}
	}
}

/**
 * True while a claim is held: its process runs (the pid alive and started when the claim says, I-14), or it is
 * younger than the stale limit. A claim older than `CLAIM_MAX_HELD_MS` is held no more, live or not (verdict, answer
 * and note runs are short).
 */
function isHeld(params: { holder: ClaimHolder; staleMs: number }): boolean {
	const { holder } = params
	const age = Date.now() - holder.writtenAt
	if (age > CLAIM_MAX_HELD_MS) return false
	return holder.alive || age < params.staleMs
}

/**
 * The start times read for one wait or one claim loop (L-4): another process's is read once per pid, `onStartRead`
 * called on each read.
 */
export function startTimesOf(params: {
	onStartRead?: ((params: { pid: number }) => void) | undefined
	/** Replaces the `ps` call (J-7 seam): its output for the pid under the given environment. */
	psOutput?: ClaimFileParams['psOutput']
}): StartTimes {
	const read = new Map<number, number | null>()
	return {
		startOf: function startOf(pid: number): number | null {
			if (pid === process.pid) return ownStartMs()
			if (read.has(pid)) return read.get(pid) ?? null
			params.onStartRead?.({ pid })
			const start = otherStartMs({ pid, psOutput: params.psOutput })
			read.set(pid, start)
			return start
		},
	}
}

/** Releases a claim this process holds; a claim already gone is left gone. */
export function releaseClaim(params: { path: string }): void {
	try {
		unlinkSync(params.path)
	} catch (error) {
		if (!isCode({ error, code: 'ENOENT' })) throw error
	}
}

/**
 * Who holds a claim (`<pid>\n<startMs>\n`): the process id, the start time of that process it records, whether
 * that process runs (a pid running under another start time is a pid reused, and a claim without a start time
 * names no process: not alive, I-14), when it was written; undefined when gone. `starts` keeps the start times read
 * for the caller's loop (L-4).
 */
export function claimHolderOf(params: {
	path: string
	starts?: StartTimes
}): ClaimHolder | undefined {
	let text: string
	let writtenAt: number
	try {
		text = readFileSync(params.path, 'utf8')
		writtenAt = statSync(params.path).mtimeMs
	} catch (error) {
		if (isCode({ error, code: 'ENOENT' })) return undefined
		throw error
	}
	const [pidLine = '', startLine = ''] = text.split(CLAIM_LINE_SEPARATOR)
	const pid = Number(pidLine.trim())
	const startedAt = startLine.trim() === '' ? Number.NaN : Number(startLine.trim())
	const running =
		Number.isInteger(pid) && pid > 0 && Number.isFinite(startedAt) && isRunning({ pid })
	return {
		pid,
		startedAt,
		alive:
			running && startedWhenRecorded({ pid, startedAt, starts: params.starts ?? startTimesOf({}) }),
		writtenAt,
	}
}

/** The start time (ms) of this process: now less its uptime. */
function ownStartMs(): number {
	return Date.now() - process.uptime() * 1000
}

/**
 * Whether a running pid started when the claim records (within `CLAIM_START_TOLERANCE_MS`): this process's start
 * is read in process; another's with one `ps -o lstart=` call per pid for the loop (L-4). A start time that cannot be
 * read (no `ps`, a failure, no output, an output that does not parse) is unknown (J-10): the running pid decides. A pid
 * reused is only one whose start time was read, parsed and differs.
 */
function startedWhenRecorded(params: {
	pid: number
	startedAt: number
	starts: StartTimes
}): boolean {
	const actual = params.starts.startOf(params.pid)
	return actual === null || Math.abs(actual - params.startedAt) <= CLAIM_START_TOLERANCE_MS
}

/**
 * The start time (ms) of another process, from one `ps` call run in the C locale (J-7: a date `Date.parse` reads);
 * null when it cannot be read or does not parse.
 */
function otherStartMs(params: {
	pid: number
	psOutput: ClaimFileParams['psOutput']
}): number | null {
	const environment = { ...process.env, ...PS_LOCALE }
	try {
		const text = (
			params.psOutput?.({ pid: params.pid, environment }) ??
			execFileSync(PS_COMMAND, [...PS_START_ARGUMENTS, String(params.pid)], {
				encoding: 'utf8',
				env: environment,
				stdio: ['ignore', 'pipe', 'ignore'],
			})
		).trim()
		const parsed = Date.parse(text)
		return Number.isNaN(parsed) ? null : parsed
	} catch {
		return null
	}
}

/** The exclusive create of the claim, holding this process's id and start time (I-14); false when one is there. */
function createdClaim(params: { path: string }): boolean {
	try {
		writeFileSync(params.path, `${process.pid}\n${Math.round(ownStartMs())}\n`, { flag: 'wx' })
		return true
	} catch (error) {
		if (isCode({ error, code: 'EEXIST' })) return false
		throw error
	}
}

/**
 * Moves a stale claim aside then removes it (another taker that moved it first leaves nothing to move). The claim
 * moved is checked to still name the stale process read (R1-5): a claim another taker made between the read and the
 * move is put back where it was (never over a claim made since), and the caller tries again.
 */
function takenOver(params: { path: string; stalePid: number }): void {
	const aside = `${params.path}${fillMessage({
		template: STALE_CLAIM_SUFFIX,
		values: { pid: String(process.pid), id: randomUUID() },
	})}`
	try {
		renameSync(params.path, aside)
	} catch (error) {
		if (isCode({ error, code: 'ENOENT' })) return
		throw error
	}
	const moved = claimHolderOf({ path: aside })
	if (moved !== undefined && moved.pid !== params.stalePid) putBack({ aside, path: params.path })
	releaseClaim({ path: aside })
}

/** Puts a claim moved aside by mistake back in place, unless a claim was made there since (a hard link: exclusive). */
function putBack(params: { aside: string; path: string }): void {
	try {
		linkSync(params.aside, params.path)
	} catch (error) {
		if (!isCode({ error, code: 'EEXIST' })) throw error
	}
}

/** Whether a process of that id runs (one this user may not signal runs too). */
function isRunning(params: { pid: number }): boolean {
	try {
		process.kill(params.pid, 0)
		return true
	} catch (error) {
		return isCode({ error, code: 'EPERM' })
	}
}

function isCode(params: { error: unknown; code: string }): boolean {
	const { error } = params
	return error instanceof Error && 'code' in error && error.code === params.code
}
