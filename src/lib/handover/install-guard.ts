/**
 * The install guard of `handover run`, before each lot's commit (its files staged, `syncNodeModules` done):
 * `node_modules` must hold the lock the commit holds, the index's `package-lock.json`, or the commit's hook tests
 * other dependencies than the commit records. Every lot is checked against the index lock (`checkNodeModules` on that
 * lock's text), a lot staging a lock change too, after the installer brought `node_modules` to it. A mismatch, a lock
 * that cannot be read or a check that cannot be made refuses the lot: when the working copy holds another lock than
 * the index for git (a later lot's), the refusal says so, since `npm ci` in the worktree would install that one. Each
 * check is recorded, replaced whole, in the hand-over folder's `install.json`, which the card reads
 * (`readInstallLine`). No lock in the index: nothing checked, nothing written (an earlier lot's record stays).
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { firstLineOf } from '../error-reason.ts'
import { GIT_READ_ENVIRONMENT } from '../git.constants.ts'
import { readStagedFile } from '../git.ts'
import { shellQuote } from '../shell-quote.ts'
import { checkNodeModules, lockHashOf } from '../worktree/check-node-modules.ts'
import { PACKAGE_LOCK_FILE } from '../worktree/worktree.constants.ts'
import { HANDOVER_FILES } from './handover.constants.ts'
import {
	INDEX_FILE_UNREADABLE_REFUSAL,
	INSTALL_LATER_LOCK_REFUSAL,
	INSTALL_LINE_HASH_LENGTH,
	INSTALL_LINE_LATER_LOCK,
	INSTALL_LINE_MISMATCHED,
	INSTALL_LINE_NAME,
	INSTALL_LINE_PASSED,
	INSTALL_LINE_UNREADABLE,
	INSTALL_LISTED_PACKAGES,
	INSTALL_MISMATCH_REFUSAL,
	INSTALL_MORE_PACKAGES,
	INSTALL_RECORD_NOT_WRITTEN,
	INSTALL_UNREADABLE_REFUSAL,
} from './install-guard.constants.ts'

import type { CardGateLine } from '../gate-records/gate-records.types.ts'
import type { NodeModulesCheck, NodeModulesProblem } from '../worktree/worktree.types.ts'
import type { InstallGuardResult, InstallOutcome, InstallRecord } from './install-guard.types.ts'

/**
 * Before lot `lot`'s commit (its files staged, `syncNodeModules` done): `node_modules` read against the lock the
 * commit holds, the index's `package-lock.json`; when `record` is given, `install.json` there is replaced whole with
 * the result. No lock in the index: nothing checked, nothing written. A lock the index holds that git cannot read
 * (its record removed), or a check that throws, refuses the lot: never read as ok. The refusal names `worktree` (default `root`),
 * shell-quoted; the record's `working` is that worktree's lock.
 */
export function guardInstall(params: {
	root: string
	/** The repository's worktree the message names (a rehearsal's clone is `root`); default `root`. */
	worktree?: string
	/** The lot's number (from 1), named by the refusal. */
	lot: number
	record?: string
	/** Wall-clock time of the record's `at`; default `() => new Date()`. */
	now?: () => Date
}): InstallGuardResult {
	const { root } = params
	let indexLock: Buffer | undefined
	try {
		indexLock = readStagedFile({ root, file: PACKAGE_LOCK_FILE })
	} catch (error) {
		return unreadableIndexLock({ error, record: params.record })
	}
	if (indexLock === undefined) return { ok: true }
	const lock = indexLock
	const now = params.now ?? currentDate
	const repository = params.worktree ?? root
	/** Replaces the record whole with this check's outcome; the `!` line when it cannot be written. */
	function record(outcome: InstallOutcome): string | undefined {
		return writeCheckRecord({ path: params.record, repository, lock, now, outcome })
	}
	let checked: NodeModulesCheck
	try {
		checked = checkNodeModules({ worktree: root, lockText: lock.toString('utf8') })
	} catch (error) {
		// a lock entry the check cannot follow: refused with its reason, never committed unchecked
		return withWarning({
			result: { refusal: firstLineOf(error), lines: [] },
			warning: record({ ok: false, mismatched: 0 }),
		})
	}
	const worktree = shellQuote(repository)
	if (checked.notChecked !== undefined) {
		const reason = checked.notChecked
		return withWarning({
			result: {
				refusal: INSTALL_UNREADABLE_REFUSAL.replace('{reason}', () => reason).replace(
					'{worktree}',
					() => worktree,
				),
				lines: [],
			},
			warning: record({ ok: false, mismatched: 0 }),
		})
	}
	if (checked.problems.length === 0)
		return withWarning({ result: { ok: true }, warning: record({ ok: true, mismatched: 0 }) })
	return mismatchRefusal({ root, lot: params.lot, worktree, problems: checked.problems, record })
}

/** A lock the index holds that git cannot read: refused, and an earlier lot's record removed. */
function unreadableIndexLock(params: {
	error: unknown
	record: string | undefined
}): InstallGuardResult {
	const reason = firstLineOf(params.error)
	// an earlier lot's record would read as this lock's pass on the card
	if (params.record !== undefined) removeRecord(params.record)
	return {
		refusal: INDEX_FILE_UNREADABLE_REFUSAL.replace('{file}', PACKAGE_LOCK_FILE).replace(
			'{reason}',
			() => reason,
		),
		lines: [],
	}
}

/** Replaces the record at `path` whole (none without a path); the `!` line when it cannot be written. */
function writeCheckRecord(params: {
	path: string | undefined
	/** The repository's worktree whose lock is the record's `working`. */
	repository: string
	/** The index lock checked. */
	lock: Buffer
	now: () => Date
	outcome: InstallOutcome
}): string | undefined {
	if (params.path === undefined) return undefined
	try {
		const working = lockHashOf(params.repository)
		writeInstallRecord({
			path: params.path,
			record: {
				at: params.now().toISOString(),
				lock: sha256Of(params.lock),
				...(working !== undefined && { working }),
				...params.outcome,
			},
		})
		return undefined
	} catch (error) {
		const reason = firstLineOf(error)
		return INSTALL_RECORD_NOT_WRITTEN.replace('{reason}', () => reason)
	}
}

/**
 * Packages differ from the index lock: refused, with the later-lot text when the working lock differs from the
 * index's for git, else the plain one naming `worktree`; recorded through `record`.
 */
function mismatchRefusal(params: {
	root: string
	lot: number
	/** The repository's worktree, shell-quoted. */
	worktree: string
	problems: readonly NodeModulesProblem[]
	record: (outcome: InstallOutcome) => string | undefined
}): InstallGuardResult {
	const { worktree, record } = params
	const mismatched = params.problems.length
	let laterLock: boolean
	try {
		laterLock = workingLockDiffers(params.root)
	} catch (error) {
		return withWarning({
			result: { refusal: firstLineOf(error), lines: [] },
			warning: record({ ok: false, mismatched }),
		})
	}
	// the card names the later lot's lock as the refusal does: git's view, recorded with the check
	const warning = record({ ok: false, mismatched, ...(laterLock && { laterLock: true }) })
	return withWarning({
		result: {
			refusal: laterLock
				? INSTALL_LATER_LOCK_REFUSAL.replace('{lot}', String(params.lot))
				: INSTALL_MISMATCH_REFUSAL.replace('{worktree}', () => worktree),
			lines: problemLines(params.problems),
		},
		warning,
	})
}

/** The record removed; a removal that fails leaves it (the lot is refused either way). */
function removeRecord(path: string): void {
	try {
		rmSync(path, { force: true })
	} catch {
		// the refusal stands: the card's line is information
	}
}

/** `result` with the record's `!` line, when there is one. */
function withWarning(params: {
	result: InstallGuardResult
	warning: string | undefined
}): InstallGuardResult {
	return params.warning === undefined
		? params.result
		: { ...params.result, warning: params.warning }
}

/**
 * The working copy's `package-lock.json` differs from the index's, as git sees it (`git diff --quiet`, its filters
 * and line endings applied): a later lot's lock. Throws when git cannot tell.
 */
function workingLockDiffers(root: string): boolean {
	const diff = spawnSync('git', ['diff', '--quiet', '--', PACKAGE_LOCK_FILE], {
		cwd: root,
		env: { ...process.env, ...GIT_READ_ENVIRONMENT },
	})
	if (diff.status === 0) return false
	if (diff.status === 1) return true
	throw new Error(
		`git diff --quiet -- ${PACKAGE_LOCK_FILE}: ${diff.stderr?.toString().trim() || `exit ${diff.status}`}`,
	)
}

/** One line per mismatched package, the first few named, the others counted. */
function problemLines(problems: readonly NodeModulesProblem[]): string[] {
	const named = problems
		.slice(0, INSTALL_LISTED_PACKAGES)
		.map((problem) => `${problem.package}: ${problem.problem}`)
	const others = problems.length - named.length
	return others > 0 ? [...named, INSTALL_MORE_PACKAGES.replace('{count}', String(others))] : named
}

/** The record written whole, as the hand-over folder's other records are. */
function writeInstallRecord(params: { path: string; record: InstallRecord }): void {
	writeFileSync(params.path, `${JSON.stringify(params.record, null, 2)}\n`)
}

/** The sha256 of `bytes`, hex: the record's lock hash, as `lockHashOf` hashes the lock on disk. */
function sha256Of(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex')
}

/** Wall-clock time now: the record's default `now`. */
function currentDate(): Date {
	return new Date()
}

/**
 * The card's `install` line from the hand-over folder's `install.json` (the record `guardInstall` replaces whole
 * after each check), never from the packages on disk: a passed line `node_modules match package-lock.json (<first 12
 * of the index lock's hash>)`, or a failed one naming how many packages differ and `run npm ci in <worktree>`
 * (shell-quoted), or, for a record of a refusal naming a later lot's lock (`laterLock`), that line's count and fix,
 * or that the lock could not be read (no package counted). The record counts while the worktree's
 * lock hashes to its `working` (the lock on disk has not moved since the check). No record, one that does not parse,
 * one missing a field (`working` included) or holding one of another type (`laterLock`, when present, a boolean), or a worktree lock that moved (or none
 * now): no line, never a pass.
 */
export function readInstallLine(params: {
	folder: string
	worktree: string
}): CardGateLine | undefined {
	const record = readInstallRecord(join(params.folder, HANDOVER_FILES.install))
	// a record of a working lock that moved since, or none now, says nothing of this one
	if (record === undefined || record.working !== lockHashOf(params.worktree)) return undefined
	if (record.ok)
		return {
			name: INSTALL_LINE_NAME,
			status: 'passed',
			detail: INSTALL_LINE_PASSED.replace('{lock}', () =>
				record.lock.slice(0, INSTALL_LINE_HASH_LENGTH),
			),
		}
	return {
		name: INSTALL_LINE_NAME,
		status: 'failed',
		detail: failedDetailOf({ record, worktree: params.worktree }),
	}
}

/** The failed line's detail: the lock unreadable, a later lot's lock, or the packages to install in the worktree. */
function failedDetailOf(params: { record: InstallRecord; worktree: string }): string {
	const { record } = params
	const count = String(record.mismatched)
	if (record.mismatched === 0) return INSTALL_LINE_UNREADABLE
	if (record.laterLock) return INSTALL_LINE_LATER_LOCK.replace('{count}', count)
	const worktree = shellQuote(params.worktree)
	return INSTALL_LINE_MISMATCHED.replace('{count}', count).replace('{worktree}', () => worktree)
}

/** The install record at `path`, every field of its type; undefined when absent, unreadable or not one. */
function readInstallRecord(path: string): InstallRecord | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return undefined
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
	const { at, lock, working, ok, mismatched, laterLock } = parsed as Record<string, unknown>
	if (typeof at !== 'string' || typeof lock !== 'string' || typeof ok !== 'boolean')
		return undefined
	if (typeof working !== 'string') return undefined
	if (laterLock !== undefined && typeof laterLock !== 'boolean') return undefined
	if (typeof mismatched !== 'number' || !Number.isInteger(mismatched) || mismatched < 0)
		return undefined
	return { at, lock, working, ok, mismatched, ...(laterLock !== undefined && { laterLock }) }
}
