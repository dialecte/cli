/**
 * While a hand-over script waits for a human or runs, nothing else may touch the repository's index:
 * the hand-over writes a lock in the worktree's git folder naming its script, the script removes it
 * after its last commit. `dialecte gate` runs under it only when the lock names a hand-over written for
 * this repository (its lots file names this repository) and no real run of it is in progress; else it
 * refuses.
 */
import { randomUUID } from 'node:crypto'
import {
	existsSync,
	linkSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { realPathOf, realPathThroughAncestors } from '../file-system.ts'
import { gitFolderOf, readGit } from '../git.ts'
import { LINE_FEED } from '../print/print.constants.ts'
import { isProcessAlive } from '../process-alive.ts'
import { processStartTime } from '../process-start-time.ts'
import { readAbandonedMarker } from './handover-marker-read.ts'
import { readRunMarker, runningRefusal } from './handover-run-marker.ts'
import {
	HANDOVER_FILES,
	HANDOVER_HOLD_REASONS,
	HANDOVER_HOLD_REFUSAL,
	HANDOVER_LOCK_FILE,
	HANDOVER_RUNNING_REFUSAL,
	LINKED_WORKTREE_GITDIR_FILE,
	LINKED_WORKTREES_FOLDER,
	LOCK_ASIDE_INFIX,
	LOCK_TAKE_ATTEMPTS,
} from './handover.constants.ts'
import { readLotsFile } from './read-lots-file.ts'

import type { HandoverHold, HandoverLockHolder } from './handover.types.ts'

export function handoverLockPath(root: string): string {
	return join(gitFolderOf(root), HANDOVER_LOCK_FILE)
}

/**
 * The lock path of the linked worktree `worktree` of the repository whose git common folder is `commonFolder`,
 * found without git: the folder of `<common>/worktrees/` whose `gitdir` names `<worktree>/.git`. Undefined when git
 * keeps no folder for it any more (the worktree removed): there is no lock left to release.
 */
export function linkedWorktreeLockPath(params: {
	commonFolder: string
	worktree: string
}): string | undefined {
	const folder = join(params.commonFolder, LINKED_WORKTREES_FOLDER)
	if (!existsSync(folder)) return undefined
	// through the ancestors: a worktree removed by hand keeps its git folder, its path resolves no more
	const worktree = realPathThroughAncestors(params.worktree)
	const own = readdirSync(folder).find(function namesTheWorktree(name) {
		const named = gitdirTargetOf(join(folder, name))
		return named !== undefined && realPathThroughAncestors(dirname(named)) === worktree
	})
	return own === undefined ? undefined : join(folder, own, HANDOVER_LOCK_FILE)
}

/**
 * The `.git` a linked worktree's git folder names in its `gitdir` file, resolved against that folder when relative;
 * undefined when the file is missing or cannot be read (the entry is skipped, never a throw).
 */
function gitdirTargetOf(entryFolder: string): string | undefined {
	try {
		const text = readFileSync(join(entryFolder, LINKED_WORKTREE_GITDIR_FILE), 'utf8').trim()
		return text === '' ? undefined : resolve(entryFolder, text)
	} catch {
		return undefined
	}
}

/**
 * Takes the lock at `lockPath` for `scriptPath`, exclusively: created only where no lock is, recording this process
 * as its writer. A live lock of another (`isLiveHolder`), or one naming this script while another live writer holds
 * it, is left as it is and its script answered. Any other lock (a rehash, a stale lock) is taken over exclusively:
 * renamed to a name of its own, then created again: of two takers one wins, the other is answered with the winner.
 * `before`: the lock's bytes before it was taken, to put back.
 */
export function takeHandoverLock(params: {
	lockPath: string
	scriptPath: string
}): { before: Buffer | undefined } | { heldBy: string } {
	const { lockPath } = params
	const writer = [process.pid, processStartTime(process.pid) ?? ''].join(LINE_FEED).trimEnd()
	const text = `${params.scriptPath}\n${writer}\n`
	let before: Buffer | undefined
	for (let attempt = 0; attempt < LOCK_TAKE_ATTEMPTS; attempt += 1) {
		if (createLockFile({ lockPath, text })) return { before }
		const found = readLockBytes(lockPath)
		// gone since the create refused: the next create decides
		if (found === undefined) continue
		const holder = holderOf(found)
		if (heldAgainst({ holder, scriptPath: params.scriptPath })) return { heldBy: holder.script }
		if (setStaleLockAside({ lockPath, found })) before = found
	}
	return { heldBy: readLockFile(lockPath) ?? params.scriptPath }
}

/** Creates the lock file holding `text`; false when one is there. */
function createLockFile(params: { lockPath: string; text: string }): boolean {
	try {
		writeFileSync(params.lockPath, params.text, { flag: 'wx' })
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
		return false
	}
}

/**
 * Moves away the stale lock read as `found`, by a rename to a name no other taker uses: true once it is gone. False
 * when another taker went first: its rename left nothing here, or what the rename caught is the lock that taker
 * made since, which goes back unless a lock is there again.
 */
function setStaleLockAside(params: { lockPath: string; found: Buffer }): boolean {
	const { lockPath } = params
	const aside = `${lockPath}${LOCK_ASIDE_INFIX}${process.pid}-${randomUUID()}`
	try {
		renameSync(lockPath, aside)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		return false
	}
	const caught = readFileSync(aside)
	const stale = caught.equals(params.found)
	try {
		if (!stale) linkSync(aside, lockPath)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
	}
	rmSync(aside)
	return stale
}

/** Whether `holder` keeps the lock from a writer of `scriptPath`. */
function heldAgainst(params: { holder: HandoverLockHolder; scriptPath: string }): boolean {
	const { holder } = params
	if (realPathOf(holder.script) !== realPathOf(params.scriptPath)) return isLiveHolder(holder)
	return holder.pid !== process.pid && writerRuns(holder)
}

/** A lock's holder is live while its writer runs, or while its script exists and names a hand-over not abandoned. */
function isLiveHolder(holder: HandoverLockHolder): boolean {
	if (writerRuns(holder)) return true
	return existsSync(holder.script) && readAbandonedMarker(dirname(holder.script)) === undefined
}

/**
 * The lock's writer still runs: its pid is alive and, when the lock holds a start time `ps` can compare, that pid
 * started then (another start time is a reused pid).
 */
function writerRuns(holder: HandoverLockHolder): boolean {
	if (holder.pid === undefined || !isProcessAlive(holder.pid)) return false
	if (holder.started === undefined) return true
	const started = processStartTime(holder.pid)
	return started === undefined || started === holder.started
}

/** The script, the writer and its start time a lock file's text names (an older cli's lock names fewer). */
function holderOf(bytes: Buffer): HandoverLockHolder {
	const [script = '', writer, started] = bytes.toString('utf8').trim().split(LINE_FEED)
	const pid = Number(writer)
	return {
		script,
		pid: Number.isSafeInteger(pid) && pid > 0 ? pid : undefined,
		started: started === undefined || started === '' ? undefined : started,
	}
}

/** The bytes of the lock file, or undefined when there is none. */
function readLockBytes(lockPath: string): Buffer | undefined {
	try {
		return readFileSync(lockPath)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
		return undefined
	}
}

/**
 * The script of the live lock at `lockPath` that keeps a writer of `scriptPath` out; undefined when there is no lock,
 * it is stale, or the writer may take it.
 */
export function lockHeldAgainst(params: {
	lockPath: string
	scriptPath: string
}): string | undefined {
	const bytes = readLockBytes(params.lockPath)
	if (bytes === undefined) return undefined
	const holder = holderOf(bytes)
	return heldAgainst({ holder, scriptPath: params.scriptPath }) ? holder.script : undefined
}

/** The lock at `lockPath` removed when it still is `scriptPath`'s (`isOwnLock`); any other left as it is. */
export function removeOwnLock(params: { lockPath: string; scriptPath: string }): void {
	if (isOwnLock(params)) rmSync(params.lockPath, { force: true })
}

/**
 * The lock at `lockPath` after a write that took it failed, only while it still is `scriptPath`'s: removed when there
 * was none, its earlier `bytes` otherwise (a failed `--rehash` of a pending hand-over keeps it held). With
 * `committed`, removed too when it named this script: a committed hand-over never holds the lock.
 */
export function restoreLock(params: {
	lockPath: string
	bytes: Buffer | undefined
	scriptPath: string
	committed?: true
}): void {
	const { lockPath, bytes, scriptPath } = params
	if (!isOwnLock({ lockPath, scriptPath })) return
	const named = bytes !== undefined && realPathOf(holderOf(bytes).script) === realPathOf(scriptPath)
	if (bytes === undefined || (params.committed && named)) rmSync(lockPath, { force: true })
	else writeFileSync(lockPath, bytes)
}

/** Whether the lock at `lockPath` still is `scriptPath`'s (by real path) and no other live writer's. */
function isOwnLock(params: { lockPath: string; scriptPath: string }): boolean {
	const bytes = readLockBytes(params.lockPath)
	if (bytes === undefined) return false
	const holder = holderOf(bytes)
	return (
		realPathOf(holder.script) === realPathOf(params.scriptPath) &&
		!heldAgainst({ holder, scriptPath: params.scriptPath })
	)
}

/** The script holding the repository, or undefined when none does. */
export function readHandoverLock(root: string): string | undefined {
	return readLockFile(handoverLockPath(root))
}

/** The script the lock file at `lockPath` names, or undefined when there is no such file. */
export function readLockFile(lockPath: string): string | undefined {
	const bytes = readLockBytes(lockPath)
	return bytes === undefined ? undefined : holderOf(bytes).script
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
