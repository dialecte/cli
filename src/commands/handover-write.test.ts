/** `handover write <lots.json>`: the same hand-over as `handover <lots.json>`; `handover` alone names its verbs. */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { CLI_SOURCE, STORE_SLUG } from '../../test/handover-store-scenario.constants.ts'
import { createBranchRepository, writeLotsFile } from '../../test/handover-store-scenario.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it, vi } from 'vitest'

/** The time both scratch repositories commit at. */
const COMMIT_DATE = '2026-11-06T12:00:00+0000'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }

/** The files of the snapshot a hand-over holds, whatever the folder it was written in. */
const SNAPSHOT_FILES = ['files.txt', 'files.sha256', 'files.deleted']

/** The cli run as a process whose output is a pipe, in `cwd`. */
function runCli(params: { argv: string[]; cwd: string }) {
	const result = spawnSync(process.execPath, [CLI_SOURCE, ...params.argv], {
		encoding: 'utf8',
		cwd: params.cwd,
	})
	return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/** A card with its folder and its registered name left out, to compare two hand-overs of one repository. */
function cardOf(params: { stdout: string; folder: string; root: string }): string {
	return params.stdout
		.split(params.folder)
		.join('<folder>')
		.split(params.root)
		.join('<root>')
		.split(basename(params.root))
		.join('<repository>')
		.replace(new RegExp(`\\d{4}-\\d{2}-\\d{2}-${STORE_SLUG}(-\\d+)?`, 'g'), '<name>')
}

describe('handover write', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('write <lots.json> and <lots.json> → the same folder files, the same snapshot and the same card', () => {
		// one hand-over holds its repository: each form writes in a repository of its own, made the same way
		// the same fixed commit time makes the two repositories' commits identical: the same HEAD in both cards
		let bareRoot: string
		let writeRoot: string
		try {
			vi.stubEnv('GIT_AUTHOR_DATE', COMMIT_DATE)
			vi.stubEnv('GIT_COMMITTER_DATE', COMMIT_DATE)
			bareRoot = createBranchRepository()
			writeRoot = createBranchRepository()
		} finally {
			vi.unstubAllEnvs()
		}
		writeFiles({ root: bareRoot, files: CHANGES })
		writeFiles({ root: writeRoot, files: CHANGES })
		const bareLots = writeLotsFile({ root: bareRoot, name: 'one' })
		const writeLots = writeLotsFile({ root: writeRoot, name: 'one' })

		const bare = runCli({ argv: ['handover', bareLots], cwd: bareRoot })
		const written = runCli({ argv: ['handover', 'write', writeLots], cwd: writeRoot })

		expect(bare.status).toBe(0)
		expect(written.status).toBe(0)
		expect(readdirSync(dirname(writeLots)).sort()).toEqual(readdirSync(dirname(bareLots)).sort())
		for (const file of SNAPSHOT_FILES)
			expect(readFileSync(join(dirname(writeLots), file), 'utf8')).toBe(
				readFileSync(join(dirname(bareLots), file), 'utf8'),
			)
		expect(cardOf({ stdout: written.stdout, folder: dirname(writeLots), root: writeRoot })).toBe(
			cardOf({ stdout: bare.stdout, folder: dirname(bareLots), root: bareRoot }),
		)
	})

	it('handover alone → usage, exit 2, naming write, show, run, abandon and list', () => {
		const run = runCli({ argv: ['handover'], cwd: temporaryFolder('dialecte-handover-usage-') })

		expect(run.status).toBe(2)
		for (const verb of ['write', 'show', 'run', 'abandon', 'list'])
			expect(`${run.stdout}${run.stderr}`).toMatch(new RegExp(`\\b${verb}\\b`))
	})
})
