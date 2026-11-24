/**
 * `handover run` archives every lot file of the worktree (CK-cli design 3.2.2): the root's and each tracked
 * package's, through one archive rule, and only when the run committed lots.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import {
	HANDOVER_LOT_NAME,
	STORE_NOW,
	STORE_WRITER_CLI,
} from '../../test/handover-store-scenario.constants.ts'
import { headOf, storeLotFolder } from '../../test/handover-store-scenario.ts'
import { removeHookLogs } from '../../test/hook-logs.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { runHandover, runHandoverRun } from './handover.ts'

import { describe, expect, it } from 'vitest'

import type { LotsFile } from '../lib/handover/handover.types.ts'

const ROOT_DECLARATION = `${JSON.stringify(
	{ accept: [{ case: 'src/read.test.ts::read > answers one', reason: 'pins existing behaviour' }] },
	null,
	'\t',
)}\n`

const PACKAGE_DECLARATION = `${JSON.stringify(
	{ revised: [{ case: 'src/button.test.ts::button > label', reason: 'the label moved' }] },
	null,
	'\t',
)}\n`

const NEXT_DECLARATION = `${JSON.stringify({ tdd: 'exempt: the next step' }, null, '\t')}\n`

const PACKAGE_LOT_FILE = 'packages/ui/.dialecte/lot.json'

/** A repository with a tracked package `packages/ui`, one changed file, its lot files, the hand-over written. */
function prepare(params: { lotFiles: Record<string, string> }): { root: string; out: string } {
	const root = createScratchRepository({
		'src/read.ts': 'export function read() {}\n',
		'packages/ui/package.json': '{ "name": "ui" }\n',
	})
	writeFiles({
		root,
		files: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n', ...params.lotFiles },
	})
	const out = storeLotFolder({ root, name: HANDOVER_LOT_NAME })
	const lotsPath = join(out, 'lots.json')
	const lotsFile: LotsFile = {
		repository: root,
		branch: 'main',
		head: headOf(root).slice(0, 7),
		gates: 'npm run check',
		lots: [{ paths: ['src/'], message: 'feat(read): read answers one\n\nThe body.' }],
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	const written = runHandover({
		probe: noRepositoryCli,
		argv: [lotsPath],
		cliPath: STORE_WRITER_CLI,
		now: STORE_NOW,
	})
	if (written.exitCode !== 0) throw new Error(written.output)
	return { root, out }
}

/** `handover run` on the folder: its exit code and the lines about lot files. */
async function runFolder(out: string): Promise<{ exitCode: number; lotFileLines: string[] }> {
	const lines: string[] = []
	removeHookLogs({ lines })
	const result = await runHandoverRun({
		probe: noRepositoryCli,
		argv: [out],
		write: (line) => lines.push(line),
		clock: createFakeClock(),
		colour: false,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		spawner: createRecordingSpawner().spawner,
	})
	const exitCode = result.exitCode
	// the refusals and a stopped run's verdict come back as the result (FIX-loud-refusals D3)
	if (result.output !== '') lines.push(...result.output.split('\n'))
	return { exitCode, lotFileLines: lines.filter((line) => line.startsWith('lot file')) }
}

function readIfExists(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

describe('handover run: every lot file archived', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it("the root's and a package's lot files non-empty -> both archived, both emptied, two lines", async () => {
		const { root, out } = prepare({
			lotFiles: { '.dialecte/lot.json': ROOT_DECLARATION, [PACKAGE_LOT_FILE]: PACKAGE_DECLARATION },
		})

		const result = await runFolder(out)

		expect({
			exitCode: result.exitCode,
			lines: result.lotFileLines,
			rootArchive: readIfExists(join(out, 'lot.json')),
			packageArchive: readIfExists(join(out, 'lots/packages/ui/lot.json')),
			rootFile: readIfExists(join(root, '.dialecte/lot.json')),
			packageFile: readIfExists(join(root, PACKAGE_LOT_FILE)),
		}).toEqual({
			exitCode: 0,
			lines: [
				`lot file archived: ${join(out, 'lot.json')}`,
				`lot file archived: ${join(out, 'lots/packages/ui/lot.json')}`,
			],
			rootArchive: ROOT_DECLARATION,
			packageArchive: PACKAGE_DECLARATION,
			rootFile: '{}\n',
			packageFile: '{}\n',
		})
	})

	it('an empty package lot file, then a second run -> not archived; the first archives kept byte-identical', async () => {
		const { root, out } = prepare({
			lotFiles: { '.dialecte/lot.json': ROOT_DECLARATION, [PACKAGE_LOT_FILE]: '{}\n' },
		})
		const first = await runFolder(out)

		const second = await runFolder(out)

		expect({
			first: first.lotFileLines,
			second: second.lotFileLines,
			rootArchive: readIfExists(join(out, 'lot.json')),
			packageArchive: readIfExists(join(out, 'lots/packages/ui/lot.json')),
			packageFile: readIfExists(join(root, PACKAGE_LOT_FILE)),
		}).toEqual({
			first: [`lot file archived: ${join(out, 'lot.json')}`],
			second: [],
			rootArchive: ROOT_DECLARATION,
			packageArchive: undefined,
			packageFile: '{}\n',
		})
	})

	it("a done hand-over run again after the package's lot file was rewritten for the next step -> left as it is, nothing written, one line", async () => {
		const { root, out } = prepare({
			lotFiles: { '.dialecte/lot.json': ROOT_DECLARATION, [PACKAGE_LOT_FILE]: PACKAGE_DECLARATION },
		})
		await runFolder(out)
		writeFiles({ root, files: { [PACKAGE_LOT_FILE]: NEXT_DECLARATION } })

		const again = await runFolder(out)

		expect({
			exitCode: again.exitCode,
			lines: again.lotFileLines,
			packageFile: readIfExists(join(root, PACKAGE_LOT_FILE)),
			packageArchive: readIfExists(join(out, 'lots/packages/ui/lot.json')),
			landed: existsSync(join(out, 'lots/packages/ui/lot.landed.json')),
			rootArchive: readIfExists(join(out, 'lot.json')),
		}).toEqual({
			exitCode: 0,
			lines: [
				`lot file left as it is: ${join(root, PACKAGE_LOT_FILE)} (this run committed no lot, so it is not the archived lot's declaration)`,
			],
			packageFile: NEXT_DECLARATION,
			packageArchive: PACKAGE_DECLARATION,
			landed: false,
			rootArchive: ROOT_DECLARATION,
		})
	})

	it('the same re-run where the folder holds no archive of the package -> left as it is, nothing written, one line', async () => {
		const { root, out } = prepare({
			lotFiles: { '.dialecte/lot.json': ROOT_DECLARATION, [PACKAGE_LOT_FILE]: '{}\n' },
		})
		await runFolder(out)
		writeFiles({ root, files: { [PACKAGE_LOT_FILE]: NEXT_DECLARATION } })

		const again = await runFolder(out)

		expect({
			lines: again.lotFileLines,
			packageFile: readIfExists(join(root, PACKAGE_LOT_FILE)),
			packageArchive: existsSync(join(out, 'lots/packages/ui')),
		}).toEqual({
			lines: [
				`lot file left as it is: ${join(root, PACKAGE_LOT_FILE)} (this run committed no lot, so it is not the archived lot's declaration)`,
			],
			packageFile: NEXT_DECLARATION,
			packageArchive: false,
		})
	})

	it("a package archive that cannot be written -> the root's archived, the package's named and kept; a re-run once it can archives it", async () => {
		const { root, out } = prepare({
			lotFiles: { '.dialecte/lot.json': ROOT_DECLARATION, [PACKAGE_LOT_FILE]: PACKAGE_DECLARATION },
		})
		writeFileSync(join(out, 'lots'), 'a file, not a folder\n')
		const first = await runFolder(out).catch((error: unknown) => ({
			exitCode: -1,
			lotFileLines: [`thrown: ${String(error)}`],
		}))
		const afterFirst = readIfExists(join(root, PACKAGE_LOT_FILE))
		rmSync(join(out, 'lots'))

		const again = await runFolder(out)

		expect({
			firstExit: first.exitCode,
			firstLines: first.lotFileLines.map((line) => line.replace(/ \(.*\); /, ' (<why>); ')),
			afterFirst,
			againLines: again.lotFileLines,
			packageArchive: readIfExists(join(out, 'lots/packages/ui/lot.json')),
			packageFile: readIfExists(join(root, PACKAGE_LOT_FILE)),
		}).toEqual({
			firstExit: 0,
			firstLines: [
				`lot file archived: ${join(out, 'lot.json')}`,
				`lot file not archived: ${join(root, PACKAGE_LOT_FILE)} (<why>); left as it is: run the hand-over again to archive it`,
			],
			afterFirst: PACKAGE_DECLARATION,
			againLines: [`lot file archived: ${join(out, 'lots/packages/ui/lot.json')}`],
			packageArchive: PACKAGE_DECLARATION,
			packageFile: '{}\n',
		})
	})
})
