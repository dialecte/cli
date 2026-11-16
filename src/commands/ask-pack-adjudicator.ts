/**
 * `dialecte ask pack <ask-id>` on an ask whose readers closed at `needs-adjudicator` (section 8, D38): the next round
 * folder gets the adjudicator's brief (the accepted reports with their check results, the union of their cited
 * ranges, its own nonce); printed again, nothing rewritten, while the adjudicator's report is awaited.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readAcceptedReports } from '../lib/knowledge/ask/accepted-reports-file.ts'
import { adjudicatorBriefOf } from '../lib/knowledge/ask/adjudicator-brief-of.ts'
import { askPoolOf } from '../lib/knowledge/ask/ask-pool-of.ts'
import {
	ADJUDICATOR_BRIEF_FILES,
	ROUND_FOLDER_PREFIX,
	ROUNDS_FOLDER,
} from '../lib/knowledge/ask/ask.constants.ts'
import { briefSubjectOf } from '../lib/knowledge/ask/brief-subject-of.ts'
import { rangeTextOf } from '../lib/knowledge/ask/range-text-of.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { endedOf, jsonOf, textOf } from '../lib/print/print.ts'
import { recordText, replaceWhole } from '../lib/store/publish.ts'
import { askVerbRefused } from './ask-refused.ts'
import {
	PACK_EXIT_CODES,
	PACK_JSON_SCHEMA,
	PACK_MESSAGES,
	PACK_NEXT_COMMANDS,
	PACK_STATES,
} from './ask.constants.ts'

import type { CommandOutput } from '../lib/command-output.types.ts'
import type { RangeText } from '../lib/knowledge/ask/ask.types.ts'
import type { AskPackJson, PackAdjudicatorParams } from './ask.types.ts'

/**
 * The adjudicator's round of an ask: its brief written in the round after the readers' last (json last: the round is
 * open from it), or printed again when already written. Exit 0; the refusal (exit 2, or 1 for an aborted build) of
 * the readers' accepted reports missing or damaged, of documents changed since the ask, of a round being written.
 */
export async function packAdjudicator(params: PackAdjudicatorParams): Promise<CommandOutput> {
	const { ask, latest, request } = params
	if (params.open) return adjudicatorOutput({ params, round: latest.round, folder: latest.folder })
	const accepted = readAcceptedReports({ folder: latest.folder, ask })
	if ('refused' in accepted) return askVerbRefused({ message: accepted.refused })
	const pool = await askPoolOf({
		cwd: params.cwd,
		environment: params.environment,
		request,
		record: params.record,
	})
	if ('refused' in pool) return askVerbRefused({ message: pool.refused, exitCode: pool.exitCode })
	const round = latest.round + 1
	const folder = join(params.askFolder, ROUNDS_FOLDER, `${ROUND_FOLDER_PREFIX}${round}`)
	try {
		mkdirSync(folder)
	} catch (error) {
		if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
		return askVerbRefused({
			message: fillMessage({
				template: PACK_MESSAGES.roundBeingWritten,
				values: { folder, round: String(round), ask },
			}),
		})
	}
	const brief = adjudicatorBriefOf({
		ask,
		question: request.question,
		subject: briefSubjectOf({ request, record: pool.record }),
		round,
		reports: accepted.reports,
		nonce: (params.nonce ?? randomUUID)(),
		rangeText: function rangeTextOfCite({ file, from, to }): RangeText {
			const index = pool.files.get(file)
			return index === undefined
				? { lines: [], counted: 0 }
				: rangeTextOf({ file: index, from, to, original: pool.originalLines.get(file) ?? [] })
		},
	})
	replaceWhole({ path: join(folder, ADJUDICATOR_BRIEF_FILES.markdown), text: brief.markdown })
	replaceWhole({ path: join(folder, ADJUDICATOR_BRIEF_FILES.json), text: recordText(brief.json) })
	return adjudicatorOutput({ params, round, folder })
}

/** The answer of an adjudicator's round: its brief and the verdict command next; `--out` copies the brief. Exit 0. */
function adjudicatorOutput(params: {
	params: PackAdjudicatorParams
	round: number
	folder: string
}): CommandOutput {
	const { ask, out } = params.params
	const { round, folder } = params
	if (out !== undefined) {
		mkdirSync(out, { recursive: true })
		for (const name of Object.values(ADJUDICATOR_BRIEF_FILES))
			replaceWhole({ path: join(out, name), text: readFileSync(join(folder, name), 'utf8') })
	}
	const next = fillMessage({ template: PACK_NEXT_COMMANDS.adjudicator, values: { ask } })
	const answer: AskPackJson = {
		schema: PACK_JSON_SCHEMA,
		ask,
		round,
		state: PACK_STATES.adjudicator,
		readers: [],
		next,
	}
	if (params.params.json)
		return { output: endedOf(jsonOf(answer, '\t')), exitCode: PACK_EXIT_CODES.ready }
	return {
		output: textOf([
			fillMessage({
				template: PACK_MESSAGES.adjudicatorReady,
				values: {
					ask,
					round: String(round),
					brief: join(folder, ADJUDICATOR_BRIEF_FILES.markdown),
				},
			}),
			fillMessage({ template: PACK_MESSAGES.next, values: { next } }),
			'',
		]),
		exitCode: PACK_EXIT_CODES.ready,
	}
}
