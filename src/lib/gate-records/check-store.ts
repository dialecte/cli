/**
 * The records by tree, shared by every worktree of a repository: `<git-common-dir>/dialecte-checks/<tree>.json`
 * holds every record of that tree, the newest one kept per mode and key.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { readGit } from '../git.ts'
import { CHECK_KEY_FIELDS, CHECK_STORE_FOLDER } from './gate-records.constants.ts'

import type { CheckKey, GateRecord, GateRecordMode, RecordOrigin } from './gate-records.types.ts'

/** Stores `record` under `record.key.tree`; a record without key has no tree to go under and is not stored. */
export function storeCheckRecord(params: { root: string; record: GateRecord }): void {
	const { record } = params
	const { key } = record
	if (!key) return
	const kept = readTreeRecords({ root: params.root, tree: key.tree })
	const sameCheck = kept.filter((stored) => isSameCheck({ record: stored, mode: record.mode, key }))
	if (sameCheck.some((stored) => stored.at > record.at)) return
	const records = [
		...kept.filter((stored) => !isSameCheck({ record: stored, mode: record.mode, key })),
		record,
	]
	const folder = storeFolderOf(params.root)
	mkdirSync(folder, { recursive: true })
	const path = join(folder, `${key.tree}.json`)
	// written aside, then renamed: a reader in another worktree never sees half a file
	const written = `${path}.${process.pid}.tmp`
	writeFileSync(written, `${JSON.stringify(records, null, 2)}\n`)
	renameSync(written, path)
}

/** Every record of `tree`, any worktree of the repository. */
export function readTreeRecords(params: { root: string; tree: string }): GateRecord[] {
	const path = join(storeFolderOf(params.root), `${params.tree}.json`)
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
}): GateRecord | undefined {
	return readTreeRecords({ root: params.root, tree: params.key.tree })
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

/** The store's folder in the git folder every worktree of the repository `root` is in shares. */
function storeFolderOf(root: string): string {
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
