/** The records by tree in the common git folder: shared by every worktree, the reusable one found by its key. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { addWorktree, commonGitDirOf } from '../../../test/scratch-tree.ts'
import { findReusableRecord, readTreeRecords, storeCheckRecord } from './check-store.ts'
import { CHECK_STORE_FOLDER } from './gate-records.constants.ts'

import { describe, expect, it } from 'vitest'

import type { CheckKey, GateRecord } from './gate-records.types.ts'

const KEY: CheckKey = {
	tree: 'a'.repeat(40),
	lockHash: 'b'.repeat(64),
	commandHash: 'c'.repeat(64),
	linked: 'd'.repeat(64),
}

const HEAD = 'e'.repeat(40)

function recordOf(params: Partial<GateRecord> & { key?: CheckKey } = {}): GateRecord {
	return {
		mode: 'fast',
		at: '2026-01-01T00:00:00.000Z',
		head: HEAD,
		stateHash: 'f'.repeat(64),
		steps: [{ name: 'check', status: 'passed', counts: {} }],
		key: KEY,
		...params,
	}
}

function repository(): string {
	return createScratchRepository({ 'src/a.ts': 'export {}\n' })
}

describe('the store of records by tree', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a record stored → readTreeRecords gives it back for its tree, and none for another tree', () => {
		const root = repository()
		const record = recordOf()
		expect(storeCheckRecord({ root, record })).toBeUndefined()

		expect(readTreeRecords({ root, tree: KEY.tree })).toEqual([record])
		expect(readTreeRecords({ root, tree: '1'.repeat(40) })).toEqual([])
	})

	it('a record stored → <git-common-dir>/dialecte-checks/<tree>.json exists', () => {
		const root = repository()
		expect(storeCheckRecord({ root, record: recordOf() })).toBeUndefined()

		expect(existsSync(join(commonGitDirOf(root), CHECK_STORE_FOLDER, `${KEY.tree}.json`))).toBe(
			true,
		)
	})

	it('a record stored from a worktree → a second worktree of the same repository reads it', () => {
		const root = repository()
		const second = addWorktree(root)
		const record = recordOf()
		expect(storeCheckRecord({ root, record })).toBeUndefined()

		expect(readTreeRecords({ root: second, tree: KEY.tree })).toEqual([record])
	})

	it('two records of one tree, other modes → both are kept', () => {
		const root = repository()
		const fast = recordOf({ mode: 'fast' })
		const full = recordOf({ mode: 'full' })
		expect(storeCheckRecord({ root, record: fast })).toBeUndefined()
		expect(storeCheckRecord({ root, record: full })).toBeUndefined()

		expect(readTreeRecords({ root, tree: KEY.tree })).toHaveLength(2)
		expect(readTreeRecords({ root, tree: KEY.tree })).toEqual(expect.arrayContaining([fast, full]))
	})

	it('two records of one tree, the same mode and key → the newest is kept, whichever was stored last', () => {
		const root = repository()
		const older = recordOf({ at: '2026-01-01T00:00:00.000Z' })
		const newer = recordOf({ at: '2026-02-02T00:00:00.000Z' })
		expect(storeCheckRecord({ root, record: newer })).toBeUndefined()
		expect(storeCheckRecord({ root, record: older })).toBeUndefined()

		expect(readTreeRecords({ root, tree: KEY.tree })).toEqual([newer])
	})
})

describe('findReusableRecord', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a green record of the mode and the same key → found, whole', () => {
		const root = repository()
		const record = recordOf()
		expect(storeCheckRecord({ root, record })).toBeUndefined()

		expect(findReusableRecord({ root, mode: 'fast', key: KEY })).toEqual(record)
	})

	it('nothing stored → undefined', () => {
		const root = repository()

		expect(findReusableRecord({ root, mode: 'fast', key: KEY })).toBeUndefined()
	})

	const OTHER_KEYS: Record<string, CheckKey> = {
		tree: { ...KEY, tree: '2'.repeat(40) },
		lockHash: { ...KEY, lockHash: '2'.repeat(64) },
		commandHash: { ...KEY, commandHash: '2'.repeat(64) },
		linked: { ...KEY, linked: '2'.repeat(64) },
	}

	for (const [field, other] of Object.entries(OTHER_KEYS))
		it(`a green record whose ${field} differs → not found`, () => {
			const root = repository()
			expect(storeCheckRecord({ root, record: recordOf({ key: other }) })).toBeUndefined()

			expect(findReusableRecord({ root, mode: 'fast', key: KEY })).toBeUndefined()
		})

	it('a green record of another mode, the same key → not found', () => {
		const root = repository()
		expect(storeCheckRecord({ root, record: recordOf({ mode: 'full' }) })).toBeUndefined()
		expect(storeCheckRecord({ root, record: recordOf({ mode: 'hook' }) })).toBeUndefined()

		expect(findReusableRecord({ root, mode: 'fast', key: KEY })).toBeUndefined()
	})

	it('a failed record only → not found', () => {
		const root = repository()
		expect(
			storeCheckRecord({
				root,
				record: recordOf({
					steps: [{ name: 'check', status: 'failed', counts: {}, reason: 'exit 1' }],
				}),
			}),
		).toBeUndefined()

		expect(findReusableRecord({ root, mode: 'fast', key: KEY })).toBeUndefined()
	})

	it('a record stored from another worktree of the repository → found from this one', () => {
		const root = repository()
		const second = addWorktree(root)
		const record = recordOf()
		expect(storeCheckRecord({ root: second, record })).toBeUndefined()

		expect(findReusableRecord({ root, mode: 'fast', key: KEY })).toEqual(record)
	})
})

/** The store file of `KEY.tree`, written by hand: what a hand edit or another cli leaves there. */
function writeStoreFile(params: { root: string; content: string }): void {
	const folder = join(commonGitDirOf(params.root), CHECK_STORE_FOLDER)
	mkdirSync(folder, { recursive: true })
	writeFileSync(join(folder, `${KEY.tree}.json`), params.content)
}

describe('the store: records that are not records', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	const NOT_RECORDS: Record<string, unknown> = {
		'a record without steps': [
			{ mode: 'fast', at: '2026-01-01T00:00:00.000Z', head: HEAD, key: KEY },
		],
		'a record whose steps are no array': [{ ...recordOf(), steps: 'passed' }],
		'a record without key': [{ ...recordOf(), key: undefined }],
		'a null among the records': [null],
	}

	for (const [name, content] of Object.entries(NOT_RECORDS))
		it(`${name} in the store file → ignored: readTreeRecords gives none and findReusableRecord answers nothing, without throwing`, () => {
			const root = repository()
			writeStoreFile({ root, content: JSON.stringify(content) })

			expect(readTreeRecords({ root, tree: KEY.tree })).toEqual([])
			expect(() => findReusableRecord({ root, mode: 'fast', key: KEY })).not.toThrow()
			expect(findReusableRecord({ root, mode: 'fast', key: KEY })).toBeUndefined()
		})

	it('a good record beside one without steps → only the good one is read and found', () => {
		const root = repository()
		const good = recordOf()
		writeStoreFile({
			root,
			content: JSON.stringify([{ mode: 'fast', key: KEY, at: '2999-01-01T00:00:00.000Z' }, good]),
		})

		expect(readTreeRecords({ root, tree: KEY.tree })).toEqual([good])
		expect(findReusableRecord({ root, mode: 'fast', key: KEY })).toEqual(good)
	})

	it('a green record whose steps are empty → not reusable: nothing was checked', () => {
		const root = repository()
		expect(storeCheckRecord({ root, record: recordOf({ steps: [] }) })).toBeUndefined()

		expect(findReusableRecord({ root, mode: 'fast', key: KEY })).toBeUndefined()
	})
})
