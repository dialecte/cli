/** `handover write` resolves where it writes: the default out is a real path, and `--out <number>` naming a folder says so. */
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
	STORE_FIRST_NAME,
	STORE_NOW,
	STORE_WRITER_CLI,
} from '../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	readEntry,
	writeLotsFile,
} from '../../test/handover-store-scenario.ts'
import {
	isolateStateFolder,
	registeredFolders,
	startRealLot,
} from '../../test/lot-handover-workspace.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { COMMIT_SCRIPT_FILE } from '../lib/handover/handover.constants.ts'
import { runHandover } from './handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }

describe('handover write with no --out', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the lots file in a folder reached through a symbolic link -> the registry entry, the JSON folder and commit.sh hold the real path of the folder', () => {
		isolateStateFolder()
		const root = createBranchRepository()
		writeFiles({ root, files: CHANGES })
		const realFolder = realpathSync(dirname(writeLotsFile({ root, name: 'one' })))
		const link = join(realpathSync(temporaryFolder('dialecte-lots-link-')), 'link')
		symlinkSync(realFolder, link)

		const written = runHandover({
			argv: [join(link, 'lots.json'), '--json'],
			cliPath: STORE_WRITER_CLI,
			probe: noRepositoryCli,
			now: STORE_NOW,
		})

		expect(written.exitCode).toBe(0)
		expect(JSON.parse(written.output)).toMatchObject({ folder: realFolder })
		expect(readEntry({ root, name: STORE_FIRST_NAME })).toMatchObject({ folder: realFolder })
		expect(readFileSync(join(realFolder, COMMIT_SCRIPT_FILE), 'utf8')).toContain(realFolder)
		expect(readFileSync(join(realFolder, COMMIT_SCRIPT_FILE), 'utf8')).not.toContain(link)
	})
})

describe(
	'handover write --out <number> naming a folder and a lot',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		/** `handover write <lots file> --out <index>` from a folder holding `./<index>`, the lot of that index existing. */
		function writeFromFolderHolding(params: { extra: string[] }) {
			isolateStateFolder()
			const lot = startRealLot()
			const index = String(Number(lot.lotName.slice(0, 4)))
			const cwd = realpathSync(temporaryFolder('dialecte-out-cwd-'))
			mkdirSync(join(cwd, index))
			const written = runHandover({
				argv: [lot.lotsPath, '--out', index, ...params.extra],
				cliPath: STORE_WRITER_CLI,
				probe: noRepositoryCli,
				now: STORE_NOW,
				cwd,
			})
			return {
				lot,
				written,
				folder: join(cwd, index),
				note: `${index} is the folder ./${index}, not lot ${lot.lotName}`,
			}
		}

		it('the card output -> written into ./<number> (real path), the first line of the output is the folder-wins note', () => {
			const { lot, written, folder, note } = writeFromFolderHolding({ extra: [] })

			expect(written.output.split('\n')[0]).toBe(note)
			expect(existsSync(join(folder, COMMIT_SCRIPT_FILE))).toBe(true)
			expect(registeredFolders(lot)).toEqual([realpathSync(folder)])
		})

		it('--json -> outNote holds the note and notes stays the gates text, the folder is the real path of ./<number>', () => {
			const { written, folder, note } = writeFromFolderHolding({ extra: ['--json'] })

			expect(JSON.parse(written.output)).toMatchObject({
				folder: realpathSync(folder),
				outNote: note,
				notes: 'npm run check',
			})
		})
	},
)
