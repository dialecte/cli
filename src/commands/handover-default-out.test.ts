import { existsSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
	STORE_FIRST_NAME,
	STORE_NEXT_DAY,
	STORE_NOW,
	STORE_WRITER_CLI,
	WIDE_COLUMNS,
} from '../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	entryNamesOf,
	markAbandoned,
	snapshotOf,
	footerOf,
	readEntry,
	readIfPresent,
	setEntryState,
	statusOf,
	storeOf,
	writeLotsFile,
} from '../../test/handover-store-scenario.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'
import { COMMIT_SCRIPT_FILE, HANDOVER_FILES } from '../lib/handover/handover.constants.ts'
import { runHandover } from './handover.ts'

import { describe, expect, it } from 'vitest'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }

/** `dialecte handover <lots.json> ...` as the registry cases run it: the clock fixed, no repository cli. */
function write(params: { lotsPath: string; argv?: string[]; now?: Date }) {
	return runHandover({
		argv: [params.lotsPath, ...(params.argv ?? [])],
		cliPath: STORE_WRITER_CLI,
		probe: noRepositoryCli,
		now: params.now ?? STORE_NOW,
		columns: WIDE_COLUMNS,
	})
}

describe('handover <lots.json> registers the hand-over', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('no --out → written beside the lots file as before, nothing in the working tree, and the store holds the entry { folder, branch, worktree, written, state }', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		const lotsPath = writeLotsFile({ root, name: 'one' })
		const folder = dirname(lotsPath)
		const statusBefore = statusOf(root)

		expect(write({ lotsPath })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(footerOf(STORE_FIRST_NAME)),
		})

		expect(existsSync(join(folder, COMMIT_SCRIPT_FILE))).toBe(true)
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toEqual({
			folder,
			branch: 'feat/handover-show',
			worktree: root,
			written: STORE_NOW.toISOString(),
			state: 'pending',
		})
		expect(entryNamesOf(root)).toEqual([STORE_FIRST_NAME])
		expect(readdirSync(storeOf(root)).filter((name) => !name.endsWith('.json'))).toEqual([])
		expect(statusOf(root)).toEqual(statusBefore)
	})

	it('--out <dir> → written there and registered with that folder', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		const lotsPath = writeLotsFile({ root, name: 'one' })
		const out = temporaryFolder('dialecte-handover-out-')

		expect(write({ lotsPath, argv: ['--out', out] })).toMatchObject({ exitCode: 0 })

		expect(existsSync(join(out, COMMIT_SCRIPT_FILE))).toBe(true)
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({
			folder: out,
			state: 'pending',
		})
	})

	it('a second hand-over of the branch on the same day, and one on the next day → -2, and a new dated name', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		function writeNext(params: { name: string; now: Date }) {
			const result = write({
				lotsPath: writeLotsFile({ root, name: params.name }),
				argv: ['--out', temporaryFolder('dialecte-out-')],
				now: params.now,
			})
			// the hand-over holds the worktree until it is run: released here, as a run or an abandon does
			rmSync(handoverLockPath(root), { force: true })
			return result
		}

		expect(writeNext({ name: 'one', now: STORE_NOW })).toMatchObject({ exitCode: 0 })
		expect(writeNext({ name: 'two', now: STORE_NOW })).toMatchObject({ exitCode: 0 })
		expect(writeNext({ name: 'three', now: STORE_NEXT_DAY })).toMatchObject({ exitCode: 0 })

		expect(entryNamesOf(root)).toEqual([
			STORE_FIRST_NAME,
			`${STORE_FIRST_NAME}-2`,
			'2026-11-05-feat-handover-show',
		])
	})

	it('the lots file in a folder already holding commit.sh, with --rehash → that folder rewritten, its entry updated (written, state pending), no second entry', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		const folder = temporaryFolder('dialecte-plan-')
		const lotsPath = writeLotsFile({ root, name: 'two' })
		expect(write({ lotsPath, argv: ['--out', folder] }).exitCode).toBe(0)
		setEntryState({ root, name: STORE_FIRST_NAME, state: 'abandoned' })
		const hashesBefore = readFileSync(join(folder, HANDOVER_FILES.hashes), 'utf8')
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })

		expect(
			write({
				lotsPath: join(folder, HANDOVER_FILES.lots),
				argv: ['--rehash'],
				now: STORE_NEXT_DAY,
			}),
		).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(footerOf(STORE_FIRST_NAME)),
		})

		expect(readFileSync(join(folder, HANDOVER_FILES.hashes), 'utf8')).not.toBe(hashesBefore)
		expect(entryNamesOf(root)).toEqual([STORE_FIRST_NAME])
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({
			folder,
			written: STORE_NEXT_DAY.toISOString(),
			state: 'pending',
		})
	})

	it('the same command again without --rehash → refused "pass --rehash", nothing written, still one entry', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		const lotsPath = writeLotsFile({ root, name: 'one' })
		expect(write({ lotsPath }).exitCode).toBe(0)
		const hashesBefore = readIfPresent(join(dirname(lotsPath), HANDOVER_FILES.hashes))
		const entryBefore = readEntry({ root, name: STORE_FIRST_NAME })

		expect(write({ lotsPath })).toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/exists: pass --rehash/),
		})

		expect(entryNamesOf(root)).toEqual([STORE_FIRST_NAME])
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toEqual(entryBefore)
		expect(readIfPresent(join(dirname(lotsPath), HANDOVER_FILES.hashes))).toBe(hashesBefore)
		expect(hashesBefore).toBeDefined()
	})

	it('the same folder reached through a symlink (another spelling) with --rehash → one entry, the same name, the next-day written time', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		const lotsPath = writeLotsFile({ root, name: 'one' })
		expect(write({ lotsPath }).exitCode).toBe(0)
		// the lock of the first write is released, so only the registry is in play
		rmSync(handoverLockPath(root), { force: true })
		const link = join(temporaryFolder('dialecte-link-'), 'link')
		symlinkSync(dirname(lotsPath), link, 'dir')
		const otherSpelling = join(link, HANDOVER_FILES.lots)

		expect(
			write({ lotsPath: otherSpelling, argv: ['--rehash'], now: STORE_NEXT_DAY }),
		).toMatchObject({ exitCode: 0, output: expect.stringContaining(footerOf(STORE_FIRST_NAME)) })

		expect(entryNamesOf(root)).toEqual([STORE_FIRST_NAME])
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({
			written: STORE_NEXT_DAY.toISOString(),
			state: 'pending',
		})
	})

	it('--rehash on a folder holding the abandoned marker → refused, exit 2, naming the marker, nothing written, the entry unchanged', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		const lotsPath = writeLotsFile({ root, name: 'one' })
		expect(write({ lotsPath }).exitCode).toBe(0)
		const folder = dirname(lotsPath)
		markAbandoned({ folder, file: HANDOVER_FILES.abandoned })
		const before = snapshotOf({ paths: [folder, storeOf(root)] })

		expect(write({ lotsPath, argv: ['--rehash'], now: STORE_NEXT_DAY })).toMatchObject({
			exitCode: 2,
			output: expect.stringContaining(HANDOVER_FILES.abandoned),
		})

		expect(snapshotOf({ paths: [folder, storeOf(root)] })).toEqual(before)
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ state: 'pending' })
	})
})
