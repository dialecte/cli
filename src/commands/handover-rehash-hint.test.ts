/** The note under the card `handover write` prints: the command it names for a late edit is the one that works, and it does work. */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { CLI_SOURCE } from '../../test/handover-store-scenario.constants.ts'
import { createBranchRepository, writeLotsFile } from '../../test/handover-store-scenario.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { shellQuote } from '../lib/shell-quote.ts'

import { describe, expect, it } from 'vitest'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }

const LATE_EDIT = { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' }

/** The cli run as a process whose output is a pipe, in `cwd`. */
function runCli(params: { argv: string[]; cwd: string }) {
	const result = spawnSync(process.execPath, [CLI_SOURCE, ...params.argv], {
		encoding: 'utf8',
		cwd: params.cwd,
	})
	return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

/** The command the note names for a late edit, without its `dialecte` (the text between the backticks that follows it). */
function rehashCommandOf(output: string): string | undefined {
	return /re-gate, then `dialecte (handover [^`]*)`/.exec(output)?.[1]
}

/** A repository with a change, a lots file for it and the hand-over written with `outWord` as its `--out` (none for undefined). */
function writeWith(params: { outWord: (folder: string) => string | undefined }) {
	const root = createBranchRepository()
	writeFiles({ root, files: CHANGES })
	const lotsPath = writeLotsFile({ root, name: 'one' })
	const folder = temporaryFolder('dialecte-handover-out-')
	const outWord = params.outWord(folder)
	const outArguments = outWord === undefined ? [] : ['--out', outWord]
	const written = runCli({ argv: ['handover', 'write', lotsPath, ...outArguments], cwd: root })
	return { root, lotsPath, folder, written }
}

const AS_GIVEN = (folder: string) => folder
const WITH_SPACE = (folder: string) => join(folder, 'out folder')
const NO_OUT = () => undefined

describe('handover write: the late-edit hint', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('written with --out <folder> → the note names handover write on the lots file, quoted, with the --out word printed as given (unquoted, it needs no quoting), then --rehash', () => {
		const { lotsPath, folder, written } = writeWith({ outWord: AS_GIVEN })

		expect(written.status).toBe(0)
		expect(rehashCommandOf(written.output)).toBe(
			`handover write '${lotsPath}' --out ${folder} --rehash`,
		)
	})

	it('written with --out <folder named out folder> → the --out word printed shell-quoted, as the lots path is', () => {
		const { lotsPath, folder, written } = writeWith({ outWord: WITH_SPACE })

		expect(written.status).toBe(0)
		expect(rehashCommandOf(written.output)).toBe(
			`handover write '${lotsPath}' --out ${shellQuote(WITH_SPACE(folder))} --rehash`,
		)
	})

	it.each([
		{ title: 'with --out', outWord: AS_GIVEN },
		{ title: 'with --out needing quoting', outWord: WITH_SPACE },
		{ title: 'without --out', outWord: NO_OUT },
	])(
		'written $title, then a late edit, then the printed command → accepted, exit 0',
		({ outWord }) => {
			const { root, written } = writeWith({ outWord })
			writeFiles({ root, files: LATE_EDIT })
			const printed = rehashCommandOf(written.output)

			const rehashed = spawnSync('sh', ['-c', `node '${CLI_SOURCE}' ${printed}`], {
				encoding: 'utf8',
				cwd: root,
			})

			expect(rehashed.status).toBe(0)
		},
	)
})
