import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import {
	STORE_BRANCH,
	STORE_FIRST_NAME,
	WIDE_COLUMNS,
} from '../../test/handover-store-scenario.constants.ts'
import {
	commitLotByHand,
	commitStoreHandover,
	createBranchRepository,
	createLinkedWorktree,
	failHookAfterFirstCommit,
	headOf,
	readEntry,
	removeFolder,
	runIn,
	snapshotOf,
	storeOf,
	statusOf,
	subjectsOf,
	writeStoreHandover,
	footerOf,
} from '../../test/handover-store-scenario.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'

import { describe, expect, it } from 'vitest'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }
const OTHER_CHANGES = { 'src/write.ts': 'export function write() {}\n' }
const SECOND_NAME = `${STORE_FIRST_NAME}-2`
const NOTHING_TO_RUN = /no .*hand-over/i

describe('handover run without a folder', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('one pending hand-over in the store, another committed → it runs: every lot committed, exit 0', async () => {
		const root = createBranchRepository()
		const committed = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		await commitStoreHandover({ root, folder: committed.folder })
		writeStoreHandover({ root, name: SECOND_NAME, changes: OTHER_CHANGES })

		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({ exitCode: 0 })

		expect(subjectsOf(root).slice(0, 2)).toEqual([
			`feat(read): change ${SECOND_NAME}`,
			`feat(read): change ${STORE_FIRST_NAME}`,
		])
		expect(statusOf(root)).toEqual([])
	})

	it('two pending hand-overs → refused, one line per candidate (name, branch, verdict), exit 2, nothing committed, no run marker', async () => {
		const root = createBranchRepository()
		const first = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const second = writeStoreHandover({ root, name: SECOND_NAME, changes: OTHER_CHANGES })
		const headBefore = headOf(root)

		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({
			exitCode: 2,
			lines: expect.arrayContaining([
				expect.stringMatching(
					new RegExp(`^${STORE_FIRST_NAME}\\s{2,}feat/handover-show\\s{2,}(READY|BLOCKED)$`),
				),
				expect.stringMatching(
					new RegExp(`^${SECOND_NAME}\\s{2,}feat/handover-show\\s{2,}(READY|BLOCKED)$`),
				),
			]),
		})

		expect(headOf(root)).toBe(headBefore)
		expect(existsSync(join(first.folder, HANDOVER_RUN_MARKER_FILE))).toBe(false)
		expect(existsSync(join(second.folder, HANDOVER_RUN_MARKER_FILE))).toBe(false)
	})

	it('one pending and one partly committed (in a linked worktree) → refused the same way, nothing committed', async () => {
		const root = createBranchRepository()
		const pending = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const linked = createLinkedWorktree({ root, branch: 'feat/partly' })
		const partlyName = '2026-11-04-feat-partly'
		const lots = [
			{ paths: ['src/a.ts'], message: 'feat(a): add a' },
			{ paths: ['src/b.ts'], message: 'feat(b): add b' },
		]
		const partly = writeStoreHandover({
			root: linked,
			name: partlyName,
			changes: { 'src/a.ts': 'export const a = 1\n', 'src/b.ts': 'export const b = 1\n' },
			lots,
		})
		commitLotByHand({ root: linked, paths: ['src/a.ts'], message: 'feat(a): add a' })
		const headBefore = headOf(root)
		const linkedHeadBefore = headOf(linked)

		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({
			exitCode: 2,
			lines: expect.arrayContaining([
				expect.stringMatching(
					new RegExp(`^${STORE_FIRST_NAME}\\s{2,}${STORE_BRANCH}\\s{2,}(READY|BLOCKED)$`),
				),
				expect.stringMatching(
					new RegExp(`^${partlyName}\\s{2,}feat/partly\\s{2,}(READY|BLOCKED)$`),
				),
			]),
		})

		expect(headOf(root)).toBe(headBefore)
		expect(headOf(linked)).toBe(linkedHeadBefore)
		expect(existsSync(join(pending.folder, HANDOVER_RUN_MARKER_FILE))).toBe(false)
		expect(existsSync(join(partly.folder, HANDOVER_RUN_MARKER_FILE))).toBe(false)
	})

	it('an empty store → says there is nothing to run, exit 1', async () => {
		const root = createBranchRepository()

		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({
			exitCode: 1,
			text: expect.stringMatching(NOTHING_TO_RUN),
		})
	})

	it('only committed hand-overs in the store → says there is nothing to run, exit 1', async () => {
		const root = createBranchRepository()
		const committed = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		await commitStoreHandover({ root, folder: committed.folder })
		const headBefore = headOf(root)

		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({
			exitCode: 1,
			text: expect.stringMatching(NOTHING_TO_RUN),
		})

		expect(headOf(root)).toBe(headBefore)
	})

	it('run <name> → that registered hand-over runs, whichever others are registered (one in another worktree)', async () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const linked = createLinkedWorktree({ root, branch: 'feat/other' })
		writeStoreHandover({
			root: linked,
			name: '2026-11-04-feat-other',
			changes: OTHER_CHANGES,
		})
		const linkedHeadBefore = headOf(linked)

		await expect(runIn({ cwd: root, argv: [STORE_FIRST_NAME] })).resolves.toMatchObject({
			exitCode: 0,
		})

		expect(subjectsOf(root)[0]).toBe(`feat(read): change ${STORE_FIRST_NAME}`)
		expect(headOf(linked)).toBe(linkedHeadBefore)
	})

	it('run <folder> → unchanged: that folder runs and its closing card names the store hand-over', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		await expect(
			runIn({ cwd: root, argv: [folder], columns: WIDE_COLUMNS }),
		).resolves.toMatchObject({
			exitCode: 0,
			text: expect.stringContaining(footerOf(STORE_FIRST_NAME)),
		})

		expect(subjectsOf(root)[0]).toBe(`feat(read): change ${STORE_FIRST_NAME}`)
	})

	it('run --rehearse without an argument, one pending → rehearses it, the repository untouched', async () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const headBefore = headOf(root)

		await expect(runIn({ cwd: root, argv: ['--rehearse'] })).resolves.toMatchObject({
			exitCode: 0,
			text: expect.stringContaining(`rehearsed: 1 commit(s) on ${STORE_BRANCH}`),
		})

		expect(headOf(root)).toBe(headBefore)
	})

	it('one stale hand-over (HEAD moved by something else) and one pending → the pending one runs, the stale one untouched', async () => {
		const root = createBranchRepository()
		const stale = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		commitLotByHand({ root, paths: ['src/read.ts'], message: 'chore: unrelated' })
		writeStoreHandover({ root, name: SECOND_NAME, changes: OTHER_CHANGES })

		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({ exitCode: 0 })

		expect(subjectsOf(root)[0]).toBe(`feat(read): change ${SECOND_NAME}`)
		expect(existsSync(join(stale.folder, HANDOVER_RUN_MARKER_FILE))).toBe(false)
	})

	it('one hand-over whose repository is gone and one pending → the pending one runs', async () => {
		const root = createBranchRepository()
		const linked = createLinkedWorktree({ root, branch: 'feat/gone' })
		writeStoreHandover({
			root: linked,
			name: '2026-11-04-feat-gone',
			changes: { 'src/gone.ts': 'export const gone = 1\n' },
		})
		rmSync(linked, { recursive: true, force: true })
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({ exitCode: 0 })

		expect(subjectsOf(root)[0]).toBe(`feat(read): change ${STORE_FIRST_NAME}`)
	})

	it('only a stale hand-over in the store → nothing to run, exit 1, nothing committed', async () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		commitLotByHand({ root, paths: ['src/read.ts'], message: 'chore: unrelated' })
		const headBefore = headOf(root)

		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({
			exitCode: 1,
			text: expect.stringMatching(NOTHING_TO_RUN),
		})

		expect(headOf(root)).toBe(headBefore)
	})

	it('a registered hand-over whose folder was removed and one pending → the pending one runs, the gone one skipped', async () => {
		const root = createBranchRepository()
		const gone = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		removeFolder(gone.folder)
		writeStoreHandover({ root, name: SECOND_NAME, changes: OTHER_CHANGES })

		await expect(runIn({ cwd: root, argv: [] })).resolves.toMatchObject({ exitCode: 0 })

		expect(subjectsOf(root)[0]).toBe(`feat(read): change ${SECOND_NAME}`)
	})

	it("a real run that commits every lot → the entry's state is committed", async () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		await expect(runIn({ cwd: root, argv: [STORE_FIRST_NAME] })).resolves.toMatchObject({
			exitCode: 0,
		})

		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ state: 'committed' })
	})

	it('a rehearsal, with or without an argument → every entry byte-identical and no run marker', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const before = snapshotOf({ paths: [storeOf(root)] })

		await expect(runIn({ cwd: root, argv: ['--rehearse'] })).resolves.toMatchObject({
			exitCode: 0,
		})
		await expect(
			runIn({ cwd: root, argv: [STORE_FIRST_NAME, '--rehearse'] }),
		).resolves.toMatchObject({
			exitCode: 0,
		})

		expect(snapshotOf({ paths: [storeOf(root)] })).toEqual(before)
		expect(existsSync(join(folder, HANDOVER_RUN_MARKER_FILE))).toBe(false)
	})

	it('a real run that stops after a partial commit → the entry stays pending', async () => {
		const root = createBranchRepository()
		writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: { 'src/a.ts': 'export const a = 1\n', 'src/b.ts': 'export const b = 1\n' },
			lots: [
				{ paths: ['src/a.ts'], message: 'feat(a): add a' },
				{ paths: ['src/b.ts'], message: 'feat(b): add b' },
			],
		})
		failHookAfterFirstCommit(root)

		const outcome = await runIn({ cwd: root, argv: [STORE_FIRST_NAME] })

		expect(outcome.exitCode).not.toBe(0)
		expect(subjectsOf(root)[0]).toBe('feat(a): add a')
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ state: 'pending' })
	})

	it('run <folder> of a registered folder that commits every lot → the entry is committed', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		await expect(runIn({ cwd: root, argv: [folder] })).resolves.toMatchObject({ exitCode: 0 })

		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ state: 'committed' })
	})

	it('run <name> of an entry whose folder was removed → exit 2 naming the folder, nothing committed; the removed folder given by its path → not zero either', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		removeFolder(folder)
		const headBefore = headOf(root)

		await expect(runIn({ cwd: root, argv: [STORE_FIRST_NAME] })).resolves.toMatchObject({
			exitCode: 2,
			text: expect.stringContaining(folder),
		})
		const byPath = await runIn({ cwd: root, argv: [folder] })

		expect(byPath.exitCode).not.toBe(0)
		expect(headOf(root)).toBe(headBefore)
	})
})
