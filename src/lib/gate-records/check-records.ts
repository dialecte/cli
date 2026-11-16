/**
 * The check store's records as files hold them, and what a record says (green, its origin, its key): pure reads that
 * start no process, for every reader of a store whose folder it already knows.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CHECK_KEY_FIELDS } from './gate-records.constants.ts'

import type { CheckKey, GateRecord, RecordOrigin } from './gate-records.types.ts'

/** Every record of `tree` in the check store folder `folder`; none when its file is missing, broken or of another shape. */
export function readStoredRecords(params: { folder: string; tree: string }): GateRecord[] {
	const path = join(params.folder, `${params.tree}.json`)
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
