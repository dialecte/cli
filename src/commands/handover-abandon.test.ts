import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_FIRST_NAME, STORE_NOW } from '../../test/handover-store-scenario.constants.ts'
import {
	abandon,
	boxLines,
	commitLotByHand,
	commitStoreHandover,
	createBranchRepository,
	headOf,
	indexPathOf,
	linesAfterBox,
	markAbandoned,
	readEntry,
	runCli,
	runIn,
	show,
	snapshotOf,
	subjectsOf,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'
import {
	COMMIT_SCRIPT_FILE,
	HANDOVER_FILES,
	HANDOVER_RUN_MARKER_FILE,
} from '../lib/handover/handover.constants.ts'

import { describe, expect, it } from 'vitest'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }
const OTHER_CHANGES = { 'src/write.ts': 'export function write() {}\n' }
const SECOND_NAME = `${STORE_FIRST_NAME}-2`
const TWO_LOTS = [
	{ paths: ['src/a.ts'], message: 'feat(a): add a' },
	{ paths: ['src/b.ts'], message: 'feat(b): add b' },
]
const TWO_LOT_CHANGES = {
	'src/a.ts': 'export const a = 1\n',
	'src/b.ts': 'export const b = 1\n',
}

function markerOf(folder: string): string {
	return join(folder, HANDOVER_FILES.abandoned)
}

describe('handover abandon', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a store hand-over holds the worktree, no argument → abandoned marker written, the lock gone, index and HEAD unchanged, exit 0', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})
		const headBefore = headOf(root)
		const indexBefore = snapshotOf({ paths: [indexPathOf(root)] })

		expect(abandon({ cwd: root })).toMatchObject({ exitCode: 0 })

		expect(existsSync(markerOf(folder))).toBe(true)
		expect(JSON.parse(readFileSync(markerOf(folder), 'utf8'))).toMatchObject({
			at: STORE_NOW.toISOString(),
		})
		expect(existsSync(join(folder, COMMIT_SCRIPT_FILE))).toBe(true)
		expect(existsSync(handoverLockPath(root))).toBe(false)
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ state: 'abandoned' })
		expect(headOf(root)).toBe(headBefore)
		expect(snapshotOf({ paths: [indexPathOf(root)] })).toEqual(indexBefore)
	})

	it('<name> while a real run of it is marked in progress → refused, exit 2, marker absent, lock kept', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})
		writeFileSync(
			join(folder, HANDOVER_RUN_MARKER_FILE),
			JSON.stringify({ pid: process.pid, startedAt: '2026-11-04T10:00:00.000Z' }),
		)

		const entryBefore = readEntry({ root, name: STORE_FIRST_NAME })

		expect(abandon({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/running/),
		})

		expect(entryBefore).toMatchObject({ state: 'pending' })
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toEqual(entryBefore)
		expect(existsSync(markerOf(folder))).toBe(false)
		expect(existsSync(handoverLockPath(root))).toBe(true)
	})

	it('a hand-over with every lot committed → refused, exit 2, marker absent', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		await commitStoreHandover({ root, folder })
		const entryBefore = readEntry({ root, name: STORE_FIRST_NAME })

		expect(abandon({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({ exitCode: 2 })

		expect(entryBefore).toMatchObject({ state: 'committed' })
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toEqual(entryBefore)
		expect(existsSync(markerOf(folder))).toBe(false)
	})

	it('a partly committed hand-over → abandoned, its commits kept', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: TWO_LOT_CHANGES,
			lots: TWO_LOTS,
		})
		commitLotByHand({ root, paths: ['src/a.ts'], message: 'feat(a): add a' })
		const headBefore = headOf(root)

		expect(abandon({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({ exitCode: 0 })

		expect(existsSync(markerOf(folder))).toBe(true)
		expect(headOf(root)).toBe(headBefore)
		expect(subjectsOf(root)[0]).toBe('feat(a): add a')
	})

	it('<name> whose script the lock does not name → marked, the lock naming another script kept, one line says so', () => {
		const root = createBranchRepository()
		const other = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const holder = writeStoreHandover({ root, name: SECOND_NAME, keepLock: true })
		const lockBefore = readFileSync(handoverLockPath(root), 'utf8')

		expect(abandon({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(/lock/),
		})

		expect(existsSync(markerOf(other.folder))).toBe(true)
		expect(existsSync(markerOf(holder.folder))).toBe(false)
		expect(readFileSync(handoverLockPath(root), 'utf8')).toBe(lockBefore)
	})

	it('no lock and no argument → exit 1', () => {
		const root = createBranchRepository()

		expect(abandon({ cwd: root })).toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/nothing.*held/i),
		})
	})

	it('abandoned twice → the second says it already is, exit 0', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		expect(abandon({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({ exitCode: 0 })

		expect(abandon({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(/already/),
		})
	})
})

describe('an abandoned hand-over', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('show prints ABANDONED and no run command', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		markAbandoned({ folder, file: HANDOVER_FILES.abandoned })

		expect(boxLines(show({ cwd: root, argv: [STORE_FIRST_NAME] }).output).join('\n')).toContain(
			'ABANDONED',
		)
		expect(linesAfterBox(show({ cwd: root, argv: [STORE_FIRST_NAME] }).output)).toEqual([])
	})

	it('run without an argument skips it: the other pending hand-over runs', async () => {
		const root = createBranchRepository()
		const abandoned = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		writeStoreHandover({ root, name: SECOND_NAME, changes: OTHER_CHANGES })
		markAbandoned({ folder: abandoned.folder, file: HANDOVER_FILES.abandoned })

		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({ exitCode: 0 })

		expect(subjectsOf(root)[0]).toBe(`feat(read): change ${SECOND_NAME}`)
	})

	it('run <abandoned> → exit 2 naming the marker, nothing committed', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		markAbandoned({ folder, file: HANDOVER_FILES.abandoned })
		const headBefore = headOf(root)

		await expect(runIn({ cwd: root, argv: [STORE_FIRST_NAME] })).resolves.toMatchObject({
			exitCode: 2,
			text: expect.stringMatching(/abandoned/),
		})

		expect(headOf(root)).toBe(headBefore)
	})
})

describe('abandon chained with show and run', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a real abandon, then show prints ABANDONED with no run command, and run without an argument runs the other pending hand-over', async () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		writeStoreHandover({ root, name: SECOND_NAME, changes: OTHER_CHANGES })

		expect(abandon({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({ exitCode: 0 })

		expect(show({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining('ABANDONED'),
		})
		expect(linesAfterBox(show({ cwd: root, argv: [STORE_FIRST_NAME] }).output)).toEqual([])
		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({ exitCode: 0 })
		expect(subjectsOf(root)[0]).toBe(`feat(read): change ${SECOND_NAME}`)
	})
})

describe('the cli process', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('`handover abandon` with nothing held → dispatched: exit 1, it says nothing is held', () => {
		const root = createBranchRepository()

		expect(runCli({ cwd: root, argv: ['handover', 'abandon'] })).toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/nothing.*held/i),
		})
	})
})
