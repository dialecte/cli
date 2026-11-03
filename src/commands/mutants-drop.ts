/** `dialecte mutants drop <run id> [--json]`: removes a finished run's entry from the store. */
import { dropRun } from '../lib/mutation/drop-run.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { answered, asksJson, refused, usageResult } from './mutants-output.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { OwnerCheck } from '../lib/mutation/mutation.types.ts'

/** Removes an abandoned run, or a reported run the ledger took in; refuses any other run. */
export function dropVerb(params: { root: string; argv: string[] } & OwnerCheck): CommandResult {
	const { root, argv, isAlive, startTimeOf } = params
	const json = asksJson(argv)
	const read = readArguments({ argv, valueOptions: [], flags: ['json'] })
	if (typeof read === 'string' || read.words.length !== 1)
		return usageResult({ verb: 'drop', json, read })
	const [runId] = read.words
	const result = dropRun({ root, runId, isAlive, startTimeOf })
	if (!result.ok) return refused({ verb: 'drop', json, reason: result.reason })
	return answered({
		verb: 'drop',
		json,
		text: `mutants drop: run ${runId} removed`,
		fields: { runId },
	})
}
