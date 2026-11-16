/** The note under the card `handover write` prints: the command it names for a late edit is the one that works, and it does work. */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { CLI_SOURCE } from '../../test/handover-store-scenario.constants.ts'
import { createBranchRepository, writeLotsFile } from '../../test/handover-store-scenario.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
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

/** The command the gate's line under a hand-over names to refresh it, without its `dialecte`. */
function gateRefreshCommandOf(output: string): string | undefined {
	return /refresh it with `dialecte (handover [^`]*)`/.exec(output)?.[1]
}

/** The gate's own steps, committed on the base: one step that always passes, so the gate runs its steps. */
const GATE_CONFIG = {
	'dialecte.json': `${JSON.stringify({ schema: 1, gate: { fast: [{ name: 'check', run: 'true' }], full: [{ name: 'check', run: 'true' }] } })}\n`,
}

/**
 * A repository with a change, a lots file for it and the hand-over written with `outWord` as its `--out` (none for
 * undefined); `base` files are committed before the change.
 */
function writeWith(params: {
	outWord: (folder: string) => string | undefined
	base?: Record<string, string>
}) {
	const root = createBranchRepository()
	if (params.base) {
		writeFiles({ root, files: params.base })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'gate steps'] })
	}
	writeFiles({ root, files: CHANGES })
	const lotsPath = writeLotsFile({ root, name: 'one' })
	const folder = temporaryFolder('dialecte-handover-out-')
	const outWord = params.outWord(folder)
	const outArguments = outWord === undefined ? [] : ['--out', outWord]
	const written = runCli({ argv: ['handover', 'write', lotsPath, ...outArguments], cwd: root })
	return { root, lotsPath, folder, written }
}

/** The --out word: the folder itself. */
function outAsGiven(folder: string): string {
	return folder
}

/** The --out word: a child folder whose name needs quoting. */
function outWithSpace(folder: string): string {
	return join(folder, 'out folder')
}

/** No --out word. */
function noOut(): undefined {
	return undefined
}

describe('handover write: the late-edit hint', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('written with --out <folder> → the note names handover write on the lots file, quoted, with the --out word printed as given (unquoted, it needs no quoting), then --rehash', () => {
		const { lotsPath, folder, written } = writeWith({ outWord: outAsGiven })

		expect(written.status).toBe(0)
		expect(rehashCommandOf(written.output)).toBe(
			`handover write '${lotsPath}' --out ${folder} --rehash`,
		)
	})

	it('written with --out <folder named out folder> → the --out word printed shell-quoted, as the lots path is', () => {
		const { lotsPath, folder, written } = writeWith({ outWord: outWithSpace })

		expect(written.status).toBe(0)
		expect(rehashCommandOf(written.output)).toBe(
			`handover write '${lotsPath}' --out ${shellQuote(outWithSpace(folder))} --rehash`,
		)
	})

	it.each([
		{ title: 'with --out', outWord: outAsGiven },
		{ title: 'with --out needing quoting', outWord: outWithSpace },
		{ title: 'without --out', outWord: noOut },
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

describe('gate under a hand-over: the refresh command', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('written with --out <folder named out folder>, then a late edit, then the command the gate prints → names the lots file and the hand-over folder by their real paths, shell-quoted, and is accepted, exit 0', () => {
		const { root, folder } = writeWith({ outWord: outWithSpace, base: GATE_CONFIG })
		writeFiles({ root, files: LATE_EDIT })
		const gated = runCli({ argv: ['gate'], cwd: root })
		const printed = gateRefreshCommandOf(gated.output)

		// the hold knows the hand-over folder by its real path
		const held = realpathSync(outWithSpace(folder))
		expect(printed).toBe(
			`handover write ${shellQuote(join(held, 'lots.json'))} --out ${shellQuote(held)} --rehash`,
		)
		const rehashed = spawnSync('sh', ['-c', `node '${CLI_SOURCE}' ${printed}`], {
			encoding: 'utf8',
			cwd: root,
		})
		expect(rehashed.status).toBe(0)
	})
})
