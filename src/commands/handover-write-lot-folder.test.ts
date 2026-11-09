/** `handover write --out` meets a lot: the lot's folder takes the hand-over, and everything names its real path. */
import { mkdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import {
	STORE_FIRST_NAME,
	STORE_NOW,
	STORE_WRITER_CLI,
} from '../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	entryNamesOf,
	readEntry,
	setEntryState,
	writeLotsFile,
} from '../../test/handover-store-scenario.ts'
import { LOT_CHANGES } from '../../test/lot-handover-workspace.constants.ts'
import {
	isolateStateFolder,
	registeredFolders,
	startRealLot,
	statusOf,
	withStdoutJson,
	writeInto,
} from '../../test/lot-handover-workspace.ts'
import { withJson } from '../../test/lot-start-workspace.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readHandoverLock } from '../lib/handover/handover-lock.ts'
import { COMMIT_SCRIPT_FILE } from '../lib/handover/handover.constants.ts'
import { runHandover } from './handover.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A way of spelling the lot folder after `--out` (the command runs from the lot's worktree). */
type OutRow = {
	title: string
	out: (lot: LotHandoverWorkspace) => string
}

/** A symbolic link, in a folder of the test's own, to the lot folder. */
function linkTo(folder: string): string {
	const link = join(temporaryFolder('dialecte-lot-link-'), 'link')
	symlinkSync(folder, link)
	return link
}

const OUT_ROWS: OutRow[] = [
	{ title: 'the full name', out: (lot) => lot.lotName },
	{ title: 'the index', out: (lot) => lot.lotName.slice(0, 4) },
	{ title: 'a symbolic link to the lot folder', out: (lot) => linkTo(lot.lotFolder) },
	{ title: '.dialecte/lot, relative to the worktree', out: () => join('.dialecte', 'lot') },
	{
		title: '.dialecte/lot, absolute',
		out: (lot) => join(lot.worktree, '.dialecte', 'lot'),
	},
]

describe('handover write --out on a lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of OUT_ROWS)
		it(`--out ${row.title} -> the lot folder takes the hand-over: the JSON, commit.sh and the registry name its real path`, () => {
			const lot = startRealLot()

			expect(
				withStdoutJson(
					writeInto({
						lotsPath: lot.lotsPath,
						out: row.out(lot),
						cwd: lot.worktree,
						extra: ['--json'],
					}),
				),
			).toMatchObject({ exitCode: 0, json: { folder: lot.lotFolder } })
			expect(readFileSync(join(lot.lotFolder, COMMIT_SCRIPT_FILE), 'utf8')).toContain(lot.lotFolder)
			expect(registeredFolders(lot)).toEqual([lot.lotFolder])
			expect(readHandoverLock(lot.worktree)).toBe(join(lot.lotFolder, COMMIT_SCRIPT_FILE))
		})

	it('--out the full name -> the card names the real path of the lot folder', () => {
		const lot = startRealLot()

		expect(
			writeInto({ lotsPath: lot.lotsPath, out: lot.lotName, cwd: lot.worktree }).stdout,
		).toContain(lot.lotFolder)
	})

	it('--out the full name -> lot status reads ready, with the hand-over pending under its registered name (case 19)', () => {
		const lot = startRealLot()
		writeInto({ lotsPath: lot.lotsPath, out: lot.lotName, cwd: lot.worktree })
		const [name] = entryNamesOf(lot.start.repository)

		expect(statusOf({ lot, argument: lot.lotName })).toMatchObject({
			exitCode: 0,
			json: { state: 'ready', folder: lot.lotFolder, handover: { name, state: 'pending' } },
		})
	})

	it('--out .dialecte/lot, then the worktree removed -> lot close <index> still finds the entry, lot status still reads the lot (case 44)', () => {
		const lot = startRealLot()
		writeInto({ lotsPath: lot.lotsPath, out: join('.dialecte', 'lot'), cwd: lot.worktree })
		const [name] = entryNamesOf(lot.start.repository)
		setEntryState({ root: lot.start.repository, name, state: 'committed' })
		git({ root: lot.start.repository, args: ['worktree', 'remove', '--force', lot.worktree] })

		expect(
			runLot({ cwd: lot.start.repository, argv: ['close', lot.lotName.slice(0, 4)] }),
		).toMatchObject({ exitCode: 1, output: expect.stringContaining(name) })
		expect(registeredFolders(lot)).toEqual([lot.lotFolder])
		expect(statusOf({ lot, argument: lot.lotName.slice(0, 4) })).toMatchObject({
			exitCode: 0,
			json: { state: 'committed', folder: lot.lotFolder, handover: { name } },
		})
	})
})

/** A repository on the store branch with `LOT_CHANGES`-like changes and its lots file; the folder links for `--out`. */
function plainHandoverInputs(): { root: string; lotsPath: string } {
	const root = createBranchRepository()
	writeFiles({ root, files: { ...LOT_CHANGES } })
	return { root, lotsPath: writeLotsFile({ root, name: 'plain' }) }
}

/** `handover write <lots file> --out <out> --json` in this process. */
function writePlain(params: { lotsPath: string; out: string }) {
	return withJson(
		runHandover({
			argv: [params.lotsPath, '--out', params.out, '--json'],
			cliPath: STORE_WRITER_CLI,
			probe: noRepositoryCli,
			now: STORE_NOW,
		}),
	)
}

describe('handover write --out on a folder that is no lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--out a folder that does not exist yet, under a symbolic link -> registered under the real path of its nearest existing ancestor joined with the rest', () => {
		isolateStateFolder()
		const { root, lotsPath } = plainHandoverInputs()
		const real = realpathSync(temporaryFolder('dialecte-out-real-'))
		const alias = join(temporaryFolder('dialecte-out-alias-'), 'alias')
		symlinkSync(real, alias)
		const expected = join(real, 'new', 'handover')

		expect(writePlain({ lotsPath, out: join(alias, 'new', 'handover') })).toMatchObject({
			exitCode: 0,
			json: { folder: expected },
		})
		expect(readEntry({ root, name: STORE_FIRST_NAME })?.folder).toBe(expected)
		expect(readFileSync(join(expected, COMMIT_SCRIPT_FILE), 'utf8')).toContain(expected)
	})

	it('--out an existing folder reached through a symbolic link -> registered under its real path', () => {
		isolateStateFolder()
		const { root, lotsPath } = plainHandoverInputs()
		const real = realpathSync(temporaryFolder('dialecte-out-real-'))
		mkdirSync(join(real, 'folder'))
		const alias = join(temporaryFolder('dialecte-out-alias-'), 'alias')
		symlinkSync(real, alias)
		const expected = join(real, 'folder')

		expect(writePlain({ lotsPath, out: join(alias, 'folder') })).toMatchObject({
			exitCode: 0,
			json: { folder: expected },
		})
		expect(readEntry({ root, name: STORE_FIRST_NAME })?.folder).toBe(expected)
	})
})
