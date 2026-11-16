/**
 * The hand-over card of a scratch repository whose ledger holds one red receipt carrying the flags asked: the
 * flag rows of the card's tdd section, as the reviewer reads them.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runHandover } from '../src/commands/handover.ts'
import { computeStateHash } from '../src/lib/gate-records/state-hash.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { createScratchRepository, git, temporaryFolder, writeFiles } from './scratch-repository.ts'
import {
	FLAG_CASE_FILE,
	FLAG_CASE_NAME,
	FLAG_CARD_NOW,
	FLAG_WRITER_CLI,
} from './tdd-runners-handover-flags.constants.ts'

export function handoverFlagRows(params: { flags: string[] }): string[] {
	const root = createScratchRepository({ 'src/read.ts': 'export function read() {}\n' })
	writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' } })
	const head = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	const lotsPath = join(temporaryFolder('dialecte-handover-'), 'lots.json')
	writeFileSync(
		lotsPath,
		JSON.stringify({
			repository: root,
			branch: 'main',
			head: head.slice(0, 7),
			gates: 'npm run check',
			lots: [{ paths: ['src/'], message: 'feat(read): read answers one' }],
		}),
	)
	writeFileSync(
		join(root, '.git', 'dialecte-tdd.json'),
		JSON.stringify({
			version: 3,
			entries: [
				{
					kind: 'red',
					file: FLAG_CASE_FILE,
					name: FLAG_CASE_NAME,
					project: '',
					testFileHash: 'h',
					caseHash: 'c',
					productionHash: 'p',
					flags: params.flags,
					at: '2026-10-29T12:00:00.000Z',
				},
			],
		}),
	)
	writeFileSync(
		join(root, '.git', 'dialecte-gate-full.json'),
		JSON.stringify({
			mode: 'full',
			at: new Date().toISOString(),
			head,
			stateHash: computeStateHash(root),
			steps: [
				{
					name: 'tdd',
					status: 'passed',
					counts: {},
					cases: [{ label: `${FLAG_CASE_FILE}::${FLAG_CASE_NAME}`, status: 'red' }],
				},
			],
		}),
	)
	const card = runHandover({
		probe: noRepositoryCli,
		argv: [lotsPath],
		cliPath: FLAG_WRITER_CLI,
		now: FLAG_CARD_NOW,
	})
	return card.output
		.split('\n')
		.filter((line) => /^│ \d+ flags?: /.test(line))
		.map((line) => line.slice('│ '.length).replace(/ *│$/, ''))
}
