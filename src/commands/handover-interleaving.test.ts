import { existsSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	STORE_FIRST_NAME,
	STORE_NOW,
	STORE_WRITER_CLI,
	WIDE_COLUMNS,
} from '../../test/handover-store-scenario.constants.ts'
import {
	abandon,
	createBranchRepository,
	entryNamesOf,
	footerOf,
	headOf,
	markAbandoned,
	readEntry,
	runIn,
	storeOf,
	writeLotsFile,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'
import { HANDOVER_FILES, HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'
import { runHandover } from './handover.ts'

import { describe, expect, it } from 'vitest'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }

describe('run and abandon: forced orders', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('the abandoned marker appears after run checked for it and before run writes its marker → run refuses, exit 2, commits nothing, leaves no run marker', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })
		const headBefore = headOf(root)

		await expect(
			runIn({
				cwd: root,
				argv: [STORE_FIRST_NAME],
				afterCheck: () => markAbandoned({ folder, file: HANDOVER_FILES.abandoned }),
			}),
		).resolves.toMatchObject({ exitCode: 2 })

		expect(headOf(root)).toBe(headBefore)
		expect(existsSync(join(folder, HANDOVER_RUN_MARKER_FILE))).toBe(false)
	})

	it('a live run marker appears after abandon checked for it and before abandon writes its marker → abandon refuses, exit 2, no abandoned marker, the lock and the entry kept', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})
		const entryBefore = readEntry({ root, name: STORE_FIRST_NAME })

		expect(
			abandon({
				cwd: root,
				argv: [STORE_FIRST_NAME],
				afterCheck: () =>
					writeFileSync(
						join(folder, HANDOVER_RUN_MARKER_FILE),
						JSON.stringify({ pid: process.pid, startedAt: '2026-11-04T10:00:00.000Z' }),
					),
			}),
		).toMatchObject({ exitCode: 2 })

		expect(existsSync(join(folder, HANDOVER_FILES.abandoned))).toBe(false)
		expect(existsSync(handoverLockPath(root))).toBe(true)
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toEqual(entryBefore)
	})
})

describe('registration and abandon: other orders', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('the next free name is taken by another writer between the pick and the write → the new entry goes to the next counter, the other entry stays byte-identical', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		const lotsPath = writeLotsFile({ root, name: 'one' })
		const otherEntry = join(storeOf(root), `${STORE_FIRST_NAME}.json`)
		const otherText =
			'{"folder":"/elsewhere","branch":"x","worktree":"/w","written":"t","state":"pending"}\n'

		expect(
			runHandover({
				argv: [lotsPath],
				cliPath: STORE_WRITER_CLI,
				probe: noRepositoryCli,
				now: STORE_NOW,
				columns: WIDE_COLUMNS,
				afterNamePicked: () => {
					writeFileSync(otherEntry, otherText)
				},
			}),
		).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(footerOf(`${STORE_FIRST_NAME}-2`)),
		})

		expect(readFileSync(otherEntry, 'utf8')).toBe(otherText)
		expect(entryNamesOf(root)).toEqual([STORE_FIRST_NAME, `${STORE_FIRST_NAME}-2`])
		expect(readdirSync(storeOf(root)).filter((file) => !file.endsWith('.json'))).toEqual([])
	})

	it("abandon of a folder given through a symlinked spelling → the lock naming that folder's commit.sh is released", () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({
			root,
			name: STORE_FIRST_NAME,
			changes: CHANGES,
			keepLock: true,
		})
		const link = join(temporaryFolder('dialecte-link-'), 'link')
		symlinkSync(folder, link, 'dir')

		expect(abandon({ cwd: root, argv: [link] })).toMatchObject({ exitCode: 0 })

		expect(existsSync(join(folder, HANDOVER_FILES.abandoned))).toBe(true)
		expect(existsSync(handoverLockPath(root))).toBe(false)
	})
})
