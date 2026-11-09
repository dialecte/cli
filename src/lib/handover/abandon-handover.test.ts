/**
 * `abandonHandover` (33S section 7, G12): the logic of `handover abandon` as a library function. On a plain
 * hand-over folder it gives the outcomes the command gives; its "already" branch records `abandoned` when the entry
 * is still `pending` and releases the lock naming the hand-over.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_FIRST_NAME, STORE_NOW } from '../../../test/handover-store-scenario.constants.ts'
import {
	commitLotByHand,
	createBranchRepository,
	headOf,
	indexPathOf,
	markAbandoned,
	readEntry,
	setEntryState,
	snapshotOf,
	storeOf,
	writeStoreHandover,
} from '../../../test/handover-store-scenario.ts'
import {
	isolateStateFolder,
	startRealLot,
	writeLotHandover,
} from '../../../test/lot-handover-workspace.ts'
import { writeLiveRunMarker } from '../../../test/lot-stop-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { abandonHandover } from './abandon-handover.ts'
import { handoverLockPath } from './handover-lock.ts'
import { HANDOVER_FILES } from './handover.constants.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(function isolateState() {
	isolateStateFolder()
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }
const SECOND_NAME = `${STORE_FIRST_NAME}-2`
const ONE_LOT = [{ paths: ['src/a.ts'], message: 'feat(a): add a' }]
const ONE_LOT_CHANGES = { 'src/a.ts': 'export const a = 1\n' }

function markerOf(folder: string): string {
	return join(folder, HANDOVER_FILES.abandoned)
}

describe('abandonHandover on a plain hand-over folder', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a pending hand-over the lock names -> abandoned: marker at the given time, entry abandoned, lock gone, index and HEAD unchanged', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})
		const headBefore = headOf(root)
		const indexBefore = snapshotOf({ paths: [indexPathOf(root)] })

		expect(abandonHandover({ folder, repository: root, now: STORE_NOW })).toMatchObject({
			state: 'abandoned',
			released: true,
			message: expect.stringMatching(/abandoned/),
		})

		expect(JSON.parse(readFileSync(markerOf(folder), 'utf8'))).toEqual({
			at: STORE_NOW.toISOString(),
		})
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ state: 'abandoned' })
		expect(existsSync(handoverLockPath(root))).toBe(false)
		expect(headOf(root)).toBe(headBefore)
		expect(snapshotOf({ paths: [indexPathOf(root)] })).toEqual(indexBefore)
	})

	it('a pending hand-over whose script the lock does not name -> abandoned, the lock naming another script kept', () => {
		const root = createBranchRepository()
		const other = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		writeStoreHandover({ root, name: SECOND_NAME, keepLock: true })
		const lockBefore = readFileSync(handoverLockPath(root), 'utf8')

		expect(
			abandonHandover({ folder: other.folder, repository: root, now: STORE_NOW }),
		).toMatchObject({
			state: 'abandoned',
			released: false,
			message: expect.stringMatching(/lock/),
		})

		expect(existsSync(markerOf(other.folder))).toBe(true)
		expect(readFileSync(handoverLockPath(root), 'utf8')).toBe(lockBefore)
	})

	it('a hand-over whose real run is marked in progress -> refused naming the run, no marker, entry and lock as they were', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})
		writeLiveRunMarker(folder)
		const entryBefore = readEntry({ root, name: STORE_FIRST_NAME })

		expect(abandonHandover({ folder, repository: root, now: STORE_NOW })).toMatchObject({
			state: 'refused',
			message: expect.stringMatching(/running/),
		})

		expect(existsSync(markerOf(folder))).toBe(false)
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toEqual(entryBefore)
		expect(existsSync(handoverLockPath(root))).toBe(true)
	})

	it('a run marker that appears between the check and the write of the marker -> refused, the abandon taken back, entry and lock kept', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})
		const entryBefore = readEntry({ root, name: STORE_FIRST_NAME })

		expect(
			abandonHandover({
				folder,
				repository: root,
				now: STORE_NOW,
				afterCheck: () => writeLiveRunMarker(folder),
			}),
		).toMatchObject({ state: 'refused', message: expect.stringMatching(/running/) })

		expect(existsSync(markerOf(folder))).toBe(false)
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toEqual(entryBefore)
		expect(existsSync(handoverLockPath(root))).toBe(true)
	})

	it('a hand-over whose every lot is committed -> refused naming it, no marker, entry as it was', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: ONE_LOT_CHANGES,
			lots: ONE_LOT,
			keepLock: true,
		})
		commitLotByHand({ root, paths: ['src/a.ts'], message: 'feat(a): add a' })
		const entryBefore = readEntry({ root, name: STORE_FIRST_NAME })

		expect(abandonHandover({ folder, repository: root, now: STORE_NOW })).toMatchObject({
			state: 'refused',
			message: expect.stringMatching(/committed/),
		})

		expect(existsSync(markerOf(folder))).toBe(false)
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toEqual(entryBefore)
		expect(existsSync(handoverLockPath(root))).toBe(true)
	})

	it('no repository given -> the lots file repository is the default: abandoned, entry abandoned, the lock it holds released', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})

		expect(abandonHandover({ folder, now: STORE_NOW })).toMatchObject({
			state: 'abandoned',
			released: true,
		})

		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ state: 'abandoned' })
		expect(existsSync(handoverLockPath(root))).toBe(false)
	})

	it('the folder of a lot -> abandoned like any hand-over folder (only `handover abandon` refuses a lot folder)', () => {
		const lot = startRealLot()
		const name = writeLotHandover(lot)

		expect(
			abandonHandover({ folder: lot.lotFolder, repository: lot.worktree, now: STORE_NOW }),
		).toMatchObject({ state: 'abandoned' })

		expect(existsSync(markerOf(lot.lotFolder))).toBe(true)
		expect(readEntry({ root: lot.start.repository, name })).toMatchObject({ state: 'abandoned' })
		expect(existsSync(handoverLockPath(lot.worktree))).toBe(false)
	})
})

describe('abandonHandover on a folder already abandoned', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the entry already abandoned, no lock -> already, nothing written', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		markAbandoned({ folder, file: HANDOVER_FILES.abandoned })
		setEntryState({ root, name: STORE_FIRST_NAME, state: 'abandoned' })
		const before = snapshotOf({ paths: [folder, storeOf(root)] })

		expect(abandonHandover({ folder, repository: root, now: STORE_NOW })).toMatchObject({
			state: 'already',
			released: false,
			message: expect.stringMatching(/abandoned already/),
		})

		expect(snapshotOf({ paths: [folder, storeOf(root)] })).toEqual(before)
	})

	it('the entry still pending (a kill between the marker and the record), the lock naming it -> already, the entry now abandoned, the lock gone, the marker as it was', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})
		markAbandoned({ folder, file: HANDOVER_FILES.abandoned })
		const markerBefore = readFileSync(markerOf(folder), 'utf8')

		expect(abandonHandover({ folder, repository: root, now: STORE_NOW })).toMatchObject({
			state: 'already',
			released: true,
		})

		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ state: 'abandoned' })
		expect(existsSync(handoverLockPath(root))).toBe(false)
		expect(readFileSync(markerOf(folder), 'utf8')).toBe(markerBefore)
	})

	it('the entry still pending, the lock naming another script -> already, the entry now abandoned, the lock kept', () => {
		const root = createBranchRepository()
		const other = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		writeStoreHandover({ root, name: SECOND_NAME, keepLock: true })
		markAbandoned({ folder: other.folder, file: HANDOVER_FILES.abandoned })
		const lockBefore = readFileSync(handoverLockPath(root), 'utf8')

		expect(
			abandonHandover({ folder: other.folder, repository: root, now: STORE_NOW }),
		).toMatchObject({ state: 'already', released: false })

		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ state: 'abandoned' })
		expect(readEntry({ root, name: SECOND_NAME })).toMatchObject({ state: 'pending' })
		expect(readFileSync(handoverLockPath(root), 'utf8')).toBe(lockBefore)
	})

	it('a marker written at an earlier time -> already naming that time, the marker not rewritten', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		markAbandoned({ folder, file: HANDOVER_FILES.abandoned })
		writeFileSync(markerOf(folder), `${JSON.stringify({ at: '2026-11-01T00:00:00.000Z' })}\n`)

		expect(abandonHandover({ folder, repository: root, now: STORE_NOW })).toMatchObject({
			state: 'already',
			message: expect.stringContaining('2026-11-01T00:00:00.000Z'),
		})

		expect(JSON.parse(readFileSync(markerOf(folder), 'utf8'))).toEqual({
			at: '2026-11-01T00:00:00.000Z',
		})
	})
})
