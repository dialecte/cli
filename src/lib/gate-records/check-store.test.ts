/** The records by tree in the common git folder: shared by every worktree, the reusable one found by its key. */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { addWorktree, commonGitDirOf } from '../../../test/scratch-tree.ts'
import { processStartTime } from '../process-start-time.ts'
import { findReusableRecord, readTreeRecords, storeCheckRecord } from './check-store.ts'
import { CHECK_STORE_FOLDER, CHECK_STORE_LOCK_SUFFIX } from './gate-records.constants.ts'

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

/** The pid of a process that ran and is gone: no live process holds it. */
function deadPid(): number {
	const child = spawnSync(process.execPath, ['-e', ''])
	if (child.pid === undefined) throw new Error('no pid for the child process')
	return child.pid
}

/** The lock file of `KEY.tree`. */
function lockPathOf(root: string): string {
	return join(
		commonGitDirOf(root),
		CHECK_STORE_FOLDER,
		`${KEY.tree}.json${CHECK_STORE_LOCK_SUFFIX}`,
	)
}

/** The lock of `KEY.tree` naming `pid` and `started` (two lines), as a writer that crashed or still runs leaves it. */
function holdLock(params: { root: string; pid: number; started: string }): string {
	mkdirSync(join(commonGitDirOf(params.root), CHECK_STORE_FOLDER), { recursive: true })
	const lock = lockPathOf(params.root)
	writeFileSync(lock, `${params.pid}\n${params.started}`)
	return lock
}

/** The real start time of a live process. */
function startTimeOf(pid: number): string {
	const started = processStartTime(pid)
	if (started === undefined) throw new Error(`no start time for pid ${pid}`)
	return started
}

describe('the store: two writers of one tree', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('writer A read the records, writer B stores its record, then A writes → both records are in the file and no lock is left', () => {
		const root = repository()
		const first = recordOf({ mode: 'fast' })
		const second = recordOf({ mode: 'full' })

		storeCheckRecord({
			root,
			record: first,
			seam: {
				beforeWrite: () => {
					expect(existsSync(lockPathOf(root))).toBe(false)
					storeCheckRecord({ root, record: second })
				},
			},
		})

		expect(readTreeRecords({ root, tree: KEY.tree })).toHaveLength(2)
		expect(readTreeRecords({ root, tree: KEY.tree })).toEqual(
			expect.arrayContaining([first, second]),
		)
		expect(existsSync(lockPathOf(root))).toBe(false)
	})

	it('writer A read the records, writer B stores the same check newer, then A writes → the newer record is kept', () => {
		const root = repository()
		const older = recordOf({ at: '2026-01-01T00:00:00.000Z' })
		const newer = recordOf({ at: '2026-02-02T00:00:00.000Z' })

		storeCheckRecord({
			root,
			record: older,
			seam: { beforeWrite: () => storeCheckRecord({ root, record: newer }) },
		})

		expect(readTreeRecords({ root, tree: KEY.tree })).toEqual([newer])
	})

	it('a lock whose process is gone → taken over: the record is stored beside the stored one, and the lock is released', () => {
		const root = repository()
		const stored = recordOf({ mode: 'fast' })
		const added = recordOf({ mode: 'full' })
		storeCheckRecord({ root, record: stored })
		const lock = holdLock({ root, pid: deadPid(), started: 'Sat Jan  1 00:00:00 2000' })

		storeCheckRecord({ root, record: added })

		expect(readTreeRecords({ root, tree: KEY.tree })).toHaveLength(2)
		expect(readTreeRecords({ root, tree: KEY.tree })).toEqual(
			expect.arrayContaining([stored, added]),
		)
		expect(existsSync(lock)).toBe(false)
	})

	it("a lock naming a live pid with a start time that is not that process's → taken over: the record is stored beside the stored one, and the lock is released", () => {
		const root = repository()
		const stored = recordOf({ mode: 'fast' })
		const added = recordOf({ mode: 'full' })
		storeCheckRecord({ root, record: stored })
		const lock = holdLock({ root, pid: process.ppid, started: 'Sat Jan  1 00:00:00 2000' })

		storeCheckRecord({ root, record: added, seam: { lockWaitMs: 0 } })

		expect(readTreeRecords({ root, tree: KEY.tree })).toHaveLength(2)
		expect(readTreeRecords({ root, tree: KEY.tree })).toEqual(
			expect.arrayContaining([stored, added]),
		)
		expect(existsSync(lock)).toBe(false)
	})

	it("a lock naming a live process by its real start time, never released → the writer waits the time it is given, then writes, the holder's lock left alone", () => {
		const root = repository()
		const stored = recordOf({ mode: 'fast' })
		const added = recordOf({ mode: 'full' })
		storeCheckRecord({ root, record: stored })
		const lock = holdLock({ root, pid: process.ppid, started: startTimeOf(process.ppid) })

		storeCheckRecord({ root, record: added, seam: { lockWaitMs: 0 } })

		expect(readTreeRecords({ root, tree: KEY.tree })).toHaveLength(2)
		expect(readTreeRecords({ root, tree: KEY.tree })).toEqual(
			expect.arrayContaining([stored, added]),
		)
		expect(existsSync(lock)).toBe(true)
	})

	it("the write throws (the tree's file is a folder) → the call throws and its lock is released", () => {
		const root = repository()
		mkdirSync(join(commonGitDirOf(root), CHECK_STORE_FOLDER, `${KEY.tree}.json`), {
			recursive: true,
		})

		expect(() => storeCheckRecord({ root, record: recordOf() })).toThrow()
		expect(existsSync(lockPathOf(root))).toBe(false)
	})
})
