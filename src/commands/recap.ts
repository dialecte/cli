/**
 * `dialecte lot recap <hand-over folder>`: the expandable part of a pull request, built from records only (the
 * commits, the gate and rules records, the findings ledger, the lot declaration, `decisions.md`).
 */
import { resolve } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { readHandoverFolder } from '../lib/handover/read-handover-folder.ts'
import { readRecapRecords } from '../lib/recap/read-recap-records.ts'
import { RECAP_USAGE } from '../lib/recap/recap.constants.ts'
import { renderRecap } from '../lib/recap/render-recap.ts'
import { verbPrefix } from '../lib/review-rounds/review-round-verbs.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'

import type { CommandResult } from '../lib/command-result.types.ts'

export function runRecap(params: { cwd: string; argv: string[] }): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [] })
	if (typeof read === 'string')
		return resultOf({ exitCode: 2, lines: [`${RECAP_USAGE} (${read})`] })
	if (read.words.length !== 1) return resultOf({ exitCode: 2, lines: [RECAP_USAGE] })
	try {
		const handover = readHandoverFolder(resolve(params.cwd, read.words[0]))
		if (typeof handover === 'string')
			return resultOf({ exitCode: 1, lines: [`${verbPrefix('recap')}: ${handover}`] })
		const records = readRecapRecords({ handover, cwd: params.cwd })
		if (typeof records === 'string')
			return resultOf({ exitCode: 1, lines: [`${verbPrefix('recap')}: ${records}`] })
		return { exitCode: 0, output: renderRecap(records) }
	} catch (error) {
		return resultOf({ exitCode: 1, lines: [`${verbPrefix('recap')}: ${(error as Error).message}`] })
	}
}
