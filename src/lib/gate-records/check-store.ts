/**
 * The records by tree, shared by every worktree of a repository: `<git-common-dir>/dialecte-checks/<tree>.json`
 * holds every record of that tree, the newest one kept per mode and key.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { readGit } from '../git.ts'
import { isGreenRecord, isSameKey, readStoredRecords } from './check-records.ts'
import { CHECK_STORE_FOLDER } from './gate-records.constants.ts'

import type { CheckKey, GateRecord, GateRecordMode } from './gate-records.types.ts'

// the pure readers live in check-records.ts (no git process); re-exported for the importers of this module
export { isGreenRecord, isSameKey, originOfRecord, readStoredRecords } from './check-records.ts'

/** Stores `record` under `record.key.tree`; a record without key has no tree to go under and is not stored. */
export function storeCheckRecord(params: {
	root: string
	record: GateRecord
	/** The absolute git common dir whose store holds the record instead of the repository's own. */
	checkStore?: string
}): void {
	const { record } = params
	const { key } = record
	if (!key) return
	const kept = readTreeRecords({ root: params.root, tree: key.tree, checkStore: params.checkStore })
	const sameCheck = kept.filter((stored) => isSameCheck({ record: stored, mode: record.mode, key }))
	if (sameCheck.some((stored) => stored.at > record.at)) return
	const records = [
		...kept.filter((stored) => !isSameCheck({ record: stored, mode: record.mode, key })),
		record,
	]
	const folder = storeFolderOf(params)
	mkdirSync(folder, { recursive: true })
	const path = join(folder, `${key.tree}.json`)
	// written aside, then renamed: a reader in another worktree never sees half a file
	const written = `${path}.${process.pid}.tmp`
	writeFileSync(written, `${JSON.stringify(records, null, 2)}\n`)
	renameSync(written, path)
}

/** Every record of `tree`, any worktree of the repository. */
export function readTreeRecords(params: {
	root: string
	tree: string
	/** The absolute git common dir whose store to read instead of the repository's own. */
	checkStore?: string
}): GateRecord[] {
	return readStoredRecords({ folder: storeFolderOf(params), tree: params.tree })
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
