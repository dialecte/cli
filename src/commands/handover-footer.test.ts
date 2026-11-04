import { join } from 'node:path'

import {
	STORE_FIRST_NAME,
	STORE_NOW,
	STORE_WRITER_CLI,
	WIDE_COLUMNS,
} from '../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	readEntry,
	removeEntry,
	runIn,
	show,
	writeLotsFile,
	writeStoreHandover,
	footerOf,
} from '../../test/handover-store-scenario.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runHandover } from './handover.ts'

import { describe, expect, it } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }

/** `dialecte handover <lots.json> ...`, the clock fixed, wide enough for the footer to stay on its rule. */
function write(params: { lotsPath: string; argv?: string[] }): CommandResult {
	return runHandover({
		argv: [params.lotsPath, ...(params.argv ?? [])],
		cliPath: STORE_WRITER_CLI,
		probe: noRepositoryCli,
		now: STORE_NOW,
		columns: WIDE_COLUMNS,
	})
}

describe('the card footer', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('the written card of a store hand-over → footer with the store name', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		const lotsPath = writeLotsFile({ root, name: 'one' })

		expect(write({ lotsPath })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(footerOf(STORE_FIRST_NAME)),
		})
	})

	it('show of a store hand-over → footer with the store name', () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		expect(show({ cwd: root, argv: [STORE_FIRST_NAME] })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(footerOf(STORE_FIRST_NAME)),
		})
	})

	it('the card after run of a store hand-over, and the rehearsal card → footer with the store name', async () => {
		const root = createBranchRepository()
		writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		await expect(
			runIn({ cwd: root, argv: [STORE_FIRST_NAME, '--rehearse'], columns: WIDE_COLUMNS }),
		).resolves.toMatchObject({
			exitCode: 0,
			text: expect.stringContaining(footerOf(STORE_FIRST_NAME)),
		})
		await expect(
			runIn({ cwd: root, argv: [STORE_FIRST_NAME], columns: WIDE_COLUMNS }),
		).resolves.toMatchObject({
			exitCode: 0,
			text: expect.stringContaining(footerOf(STORE_FIRST_NAME)),
		})
	})

	it('a registered folder given by path → show prints the registered name in the footer', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		expect(show({ cwd: root, argv: [folder] })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(footerOf(STORE_FIRST_NAME)),
		})
	})

	it('a folder with no entry (written by an earlier cli) → the footer names the folder, on show', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		expect(show({ cwd: root, argv: [folder] })).toMatchObject({
			output: expect.stringContaining(footerOf(STORE_FIRST_NAME)),
		})
		removeEntry({ root, name: STORE_FIRST_NAME })
		expect(show({ cwd: root, argv: [folder] })).toMatchObject({
			exitCode: 0,
			output: expect.stringContaining(footerOf(folder)),
		})
	})
})

describe(
	'the footer of a folder with a space in its path',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('no entry → the folder is shell-quoted in the footer', () => {
			const root = createBranchRepository()
			const folder = join(temporaryFolder('dialecte-spaced-'), 'with space', 'handover')
			writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES, folder })
			removeEntry({ root, name: STORE_FIRST_NAME })

			expect(show({ cwd: root, argv: [folder] })).toMatchObject({
				exitCode: 0,
				output: expect.stringContaining(footerOf(`'${folder}'`)),
			})
		})
	},
)

describe('--json', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a registered hand-over → name is the registered name', () => {
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		const lotsPath = writeLotsFile({ root, name: 'one' })

		expect(JSON.parse(write({ lotsPath, argv: ['--json'] }).output)).toMatchObject({
			name: STORE_FIRST_NAME,
		})
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ state: 'pending' })
	})

	it('a folder with no entry → name absent, on show', () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: STORE_FIRST_NAME, changes: CHANGES })

		expect(JSON.parse(show({ cwd: root, argv: [folder, '--json'] }).output)).toMatchObject({
			name: STORE_FIRST_NAME,
		})
		removeEntry({ root, name: STORE_FIRST_NAME })
		expect(JSON.parse(show({ cwd: root, argv: [folder, '--json'] }).output)).toMatchObject({
			folder,
		})
		expect(JSON.parse(show({ cwd: root, argv: [folder, '--json'] }).output)).not.toHaveProperty(
			'name',
		)
	})
})
