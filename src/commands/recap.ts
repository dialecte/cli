/**
 * `dialecte recap <hand-over folder>`: the expandable part of a pull request, built from records only (the
 * commits, the gate and rules records, the findings ledger, the lot declaration, `decisions.md`).
 */
import { resolve } from 'node:path'

import { readHandoverFolder } from '../lib/handover/read-handover-folder.ts'
import { readRecapRecords } from '../lib/recap/read-recap-records.ts'
import { RECAP_USAGE } from '../lib/recap/recap.constants.ts'
import { renderRecap } from '../lib/recap/render-recap.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'

import type { CommandResult } from '../lib/command-result.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runRecap({ cwd: process.cwd(), argv })
	;(result.exitCode === 0 ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runRecap(params: { cwd: string; argv: string[] }): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [] })
	if (typeof read === 'string') return { exitCode: 2, output: `${RECAP_USAGE} (${read})` }
	if (read.words.length !== 1) return { exitCode: 2, output: RECAP_USAGE }
	try {
		const handover = readHandoverFolder(resolve(params.cwd, read.words[0]))
		if (typeof handover === 'string') return { exitCode: 1, output: `recap: ${handover}` }
		const records = readRecapRecords({ handover, cwd: params.cwd })
		if (typeof records === 'string') return { exitCode: 1, output: `recap: ${records}` }
		return { exitCode: 0, output: renderRecap(records) }
	} catch (error) {
		return { exitCode: 1, output: `recap: ${(error as Error).message}` }
	}
}
