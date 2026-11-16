/**
 * The records by tree, shared by every worktree of a repository: `<git-common-dir>/dialecte-checks/<tree>.json`
 * holds every record of that tree, the newest one kept per mode and key.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { readGit } from '../git.ts'
import {
	createLockFile,
	isWriterRunning,
	lockWriterOfText,
	ownProcessStartTime,
	readLockBytes,
	setStaleLockAside,
} from '../pid-lock.ts'
import { createSystemClock } from '../progress/system-clock.ts'
import {
	CHECK_KEY_FIELDS,
	CHECK_STORE_FOLDER,
	CHECK_STORE_LOCK_POLL_MS,
	CHECK_STORE_LOCK_SUFFIX,
	CHECK_STORE_LOCK_WAIT_MS,
} from './gate-records.constants.ts'

import type {
	CheckKey,
	GateRecord,
	GateRecordMode,
	RecordOrigin,
	StoreCheckSeam,
} from './gate-records.types.ts'

/**
 * Stores `record` under `record.key.tree`; a record without key has no tree to go under and is not stored. The
 * records are read again and merged under the tree's lock, so two writers of one tree lose no record.
 */
export function storeCheckRecord(params: {
	root: string
	record: GateRecord
	/** The absolute git common dir whose store holds the record instead of the repository's own. */
	checkStore?: string
	/** Test seam: forces the order of two writers. */
	seam?: StoreCheckSeam
}): void {
	const { record } = params
	const { key } = record
	if (!key) return
	const folder = storeFolderOf(params)
	const path = join(folder, `${key.tree}.json`)
	if (isSupersededBy({ kept: readRecordsAt(path), record, key })) return
	params.seam?.beforeWrite?.()
	mkdirSync(folder, { recursive: true })
	const lock = takeTreeLock({
		lockPath: `${path}${CHECK_STORE_LOCK_SUFFIX}`,
		waitMs: params.seam?.lockWaitMs ?? CHECK_STORE_LOCK_WAIT_MS,
	})
	try {
		// read again under the lock: what another writer stored since the first read is kept
		const kept = readRecordsAt(path)
		if (isSupersededBy({ kept, record, key })) return
		const records = [
			...kept.filter((stored) => !isSameCheck({ record: stored, mode: record.mode, key })),
			record,
		]
		// written aside, then renamed: a reader in another worktree never sees half a file
		const written = `${path}.${process.pid}.tmp`
		writeFileSync(written, `${JSON.stringify(records, null, 2)}\n`)
		renameSync(written, path)
	} finally {
		if (lock !== undefined) rmSync(lock, { force: true })
	}
}

/** A record of the same check as `record` is stored and newer. */
function isSupersededBy(params: {
	kept: GateRecord[]
	record: GateRecord
	key: CheckKey
}): boolean {
	const { record, key } = params
	return params.kept.some(
		(stored) => isSameCheck({ record: stored, mode: record.mode, key }) && stored.at > record.at,
	)
}

/**
 * Takes the lock at `lockPath` (created exclusively, naming this process and its start time); a stale lock is taken
 * over, a live holder waited for up to `waitMs`. The lock's path when taken; undefined when a live holder outlasted
 * the wait (the writer then writes without it and leaves the holder's lock alone).
 */
function takeTreeLock(params: { lockPath: string; waitMs: number }): string | undefined {
	const { lockPath } = params
	const text = `${process.pid}\n${ownProcessStartTime() ?? ''}\n`
	const clock = createSystemClock()
	const deadline = clock.now() + params.waitMs
	for (;;) {
		if (createLockFile({ lockPath, text })) return lockPath
		const found = readLockBytes(lockPath)
		if (found !== undefined && isStaleLock(found)) {
			const aside = `${lockPath}.${process.pid}-${randomUUID()}.aside`
			setStaleLockAside({ lockPath, found, aside })
			continue
		}
		if (clock.now() >= deadline) return undefined
		clock.sleep(CHECK_STORE_LOCK_POLL_MS)
	}
}

/** The lock's writer is gone: its pid is dead, or alive with another start time (the pid was reused). */
function isStaleLock(bytes: Buffer): boolean {
	return !isWriterRunning(lockWriterOfText({ text: bytes.toString('utf8') }))
}

/** Every record of `tree`, any worktree of the repository. */
export function readTreeRecords(params: {
	root: string
	tree: string
	/** The absolute git common dir whose store to read instead of the repository's own. */
	checkStore?: string
}): GateRecord[] {
	return readRecordsAt(join(storeFolderOf(params), `${params.tree}.json`))
}

/** The records the tree file at `path` holds; none when it is missing or holds no list of records. */
function readRecordsAt(path: string): GateRecord[] {
	if (!existsSync(path)) return []
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
		// a record of another shape (written by hand, or by another cli) is no record of this one
		return Array.isArray(parsed) ? parsed.filter(isStoredRecord) : []
	} catch {
		// a file another run is writing, or broken by hand: nothing to reuse from it
		return []
	}
}

/** The newest green record of `mode` whose key equals `key` field by field. */
export function findReusableRecord(params: {
	root: string
	mode: GateRecordMode
	key: CheckKey
	/** The absolute git common dir whose store to read instead of the repository's own. */
	checkStore?: string
}): GateRecord | undefined {
	return readTreeRecords({
		root: params.root,
		tree: params.key.tree,
		checkStore: params.checkStore,
	})
		.filter((record) => isSameCheck({ record, mode: params.mode, key: params.key }))
		.filter(isGreenRecord)
		.sort((first, second) => second.at.localeCompare(first.at))[0]
}

/** The run a record answers for: the record itself, or the run it was answered from in turn. */
export function originOfRecord(record: GateRecord): RecordOrigin {
	return record.reused ?? { at: record.at, head: record.head }
}

/**
 * The record ran steps and every one passed or was skipped: a run that failed, or that checked nothing, is
 * never reused.
 */
export function isGreenRecord(record: GateRecord): boolean {
	return (
		record.steps.length > 0 &&
		record.steps.every((step) => step.status === 'passed' || step.status === 'skipped')
	)
}

/** The two keys name the same check: every field equal. */
export function isSameKey(params: { key: CheckKey; other: CheckKey | undefined }): boolean {
	const { key, other } = params
	return (
		other !== undefined &&
		other.tree === key.tree &&
		other.lockHash === key.lockHash &&
		other.commandHash === key.commandHash &&
		other.linked === key.linked
	)
}

function isSameCheck(params: { record: GateRecord; mode: GateRecordMode; key: CheckKey }): boolean {
	return (
		params.record.mode === params.mode && isSameKey({ key: params.key, other: params.record.key })
	)
}

/**
 * The store's folder in the git folder every worktree of the repository `root` is in shares, or in the git common
 * dir `checkStore` when one is given (a rehearsal clone's hook reads and writes the store of the repository it cloned).
 */
function storeFolderOf(params: { root: string; checkStore?: string }): string {
	const { root, checkStore } = params
	if (checkStore !== undefined) return join(checkStore, CHECK_STORE_FOLDER)
	const common = readGit({
		root,
		args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
	}).trim()
	return join(resolve(root, common), CHECK_STORE_FOLDER)
}

/** A record as the store holds them: its mode, time, HEAD, steps (each named, with a status and counts) and key. */
function isStoredRecord(entry: unknown): entry is GateRecord {
	if (typeof entry !== 'object' || entry === null) return false
	const record = entry as Record<string, unknown>
	return (
		typeof record.mode === 'string' &&
		typeof record.at === 'string' &&
		typeof record.head === 'string' &&
		Array.isArray(record.steps) &&
		record.steps.every(isRecordedStep) &&
		isCheckKey(record.key)
	)
}

function isRecordedStep(entry: unknown): boolean {
	if (typeof entry !== 'object' || entry === null) return false
	const step = entry as Record<string, unknown>
	return (
		typeof step.name === 'string' &&
		typeof step.status === 'string' &&
		typeof step.counts === 'object' &&
		step.counts !== null
	)
}

function isCheckKey(entry: unknown): boolean {
	if (typeof entry !== 'object' || entry === null) return false
	const key = entry as Record<string, unknown>
	return CHECK_KEY_FIELDS.every((field) => typeof key[field] === 'string')
}
