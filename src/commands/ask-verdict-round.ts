/**
 * What `ask verdict` reads before it checks a report: the command line, and the ask's round open for reports (D14):
 * the readers' round from its `pack.json`, or the adjudicator's from its brief (D38); every refusal names the fix.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { askRoundsOf } from '../lib/knowledge/ask/ask-rounds-of.ts'
import {
	ANSWER_RECORD_FILE,
	ANSWERED_STATE,
	ASK_ID_PATTERN,
} from '../lib/knowledge/ask/ask.constants.ts'
import { readAdjudicatorBrief } from '../lib/knowledge/ask/read-adjudicator-brief.ts'
import { readAskRecord } from '../lib/knowledge/ask/read-ask-record.ts'
import { readAskRequest } from '../lib/knowledge/ask/read-ask-request.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import {
	PACK_MESSAGES,
	VERDICT_FLAGS,
	VERDICT_MESSAGES,
	VERDICT_NEXT_COMMANDS,
	VERDICT_REPEATABLE_OPTIONS,
	VERDICT_VALUE_OPTIONS,
} from './ask.constants.ts'

import type { VerdictOptions, VerdictRound } from './ask.types.ts'

/** The verdict's command line read: the ask id, its report files and the options; or the usage refusal. */
export function verdictOptionsOf(params: { argv: string[] }): VerdictOptions | { usage: string } {
	const read = readArguments({
		argv: params.argv,
		valueOptions: VERDICT_VALUE_OPTIONS,
		flags: VERDICT_FLAGS,
		repeatable: VERDICT_REPEATABLE_OPTIONS,
	})
	if (typeof read === 'string') return { usage: read }
	const [ask, ...files] = read.words
	if (ask === undefined) return { usage: VERDICT_MESSAGES.needsAsk }
	const missing = read.lists.get('missing') ?? []
	// every reader declared --missing needs no report file (J-5)
	if (files.length === 0 && missing.length === 0)
		return { usage: fillMessage({ template: VERDICT_MESSAGES.needsReport, values: { ask } }) }
	const adjudicator = read.flags.has('adjudicator')
	if (adjudicator && files.length > 1)
		return {
			usage: fillMessage({
				template: VERDICT_MESSAGES.oneAdjudicatorReport,
				values: { ask, count: String(files.length) },
			}),
		}
	return {
		ask,
		files,
		lot: read.values.get('lot'),
		adjudicator,
		json: read.flags.has('json'),
		missing,
	}
}

/**
 * The ask's round open for reports: its latest round, holding a pack and no verdict (the readers'), or the
 * adjudicator's brief and no verdict (with `--adjudicator` only); the refusal of an unknown ask, one made before
 * the readers, one answered, a round closed, none opened, or the other route asked.
 */
export function verdictRoundOf(params: {
	asksFolder: string
	ask: string
	adjudicator: boolean
}): VerdictRound | { refused: string } {
	const { ask, asksFolder } = params
	const askFolder = join(asksFolder, ask)
	const record = ASK_ID_PATTERN.test(ask) ? readAskRecord({ askFolder }) : { absent: true as const }
	if ('absent' in record)
		return {
			refused: fillMessage({
				template: VERDICT_MESSAGES.unknownAsk,
				values: { ask, folder: asksFolder },
			}),
		}
	if ('refused' in record) return record
	const request = readAskRequest({ askFolder })
	if ('refused' in request) return request
	if ('absent' in request)
		return {
			refused: fillMessage({
				template: PACK_MESSAGES.noRequest,
				values: { ask, question: record.record.question },
			}),
		}
	// a person's answer is the latest record of all (D6): nothing more is counted
	if (existsSync(join(askFolder, ANSWER_RECORD_FILE)))
		return { refused: fillMessage({ template: PACK_MESSAGES.answered, values: { ask } }) }
	const opened = askRoundsOf({ askFolder })
	if ('refused' in opened) return opened
	const round = opened.rounds[opened.rounds.length - 1]
	if (round === undefined)
		return { refused: fillMessage({ template: VERDICT_MESSAGES.noRound, values: { ask } }) }
	const closed = closedRefusalOf({ ask, round })
	if (closed !== undefined) return { refused: closed }
	const base = {
		ask,
		askFolder,
		record: record.record,
		request: request.request,
		rounds: opened.rounds,
		round,
	}
	return routedRoundOf({ base, adjudicator: params.adjudicator })
}

/** The refusal of a round whose verdict is written: the ask answered, or the round closed and what is next. */
function closedRefusalOf(params: {
	ask: string
	round: VerdictRound['round']
}): string | undefined {
	const { ask, round } = params
	const { verdict } = round
	// a round a pack skipped for nothing left is closed at the person (J-15)
	if (verdict === null && round.skipped !== null)
		return fillMessage({
			template: VERDICT_MESSAGES.roundClosed,
			values: {
				ask,
				round: String(round.round),
				state: round.skipped.state,
				next: fillMessage({ template: VERDICT_NEXT_COMMANDS.answer, values: { ask } }),
			},
		})
	if (verdict === null) return undefined
	if (verdict.state === ANSWERED_STATE)
		return fillMessage({
			template: VERDICT_MESSAGES.answered,
			values: { ask, round: String(round.round), fact: verdict.fact ?? '' },
		})
	return fillMessage({
		template: VERDICT_MESSAGES.roundClosed,
		values: {
			ask,
			round: String(round.round),
			state: verdict.state,
			next:
				verdict.next ?? fillMessage({ template: VERDICT_NEXT_COMMANDS.answer, values: { ask } }),
		},
	})
}

/**
 * The open round as the route asks it: `--adjudicator` takes the adjudicator's round only (its brief read), a
 * readers' verdict a round holding a pack only; the refusal of the other.
 */
function routedRoundOf(params: {
	base: Omit<VerdictRound, 'pack' | 'adjudicator'>
	adjudicator: boolean
}): VerdictRound | { refused: string } {
	const { base } = params
	const { ask, round } = base
	const values = { ask, round: String(round.round) }
	if (!params.adjudicator) {
		if (round.pack !== null) return { ...base, pack: round.pack, adjudicator: null }
		const brief = readAdjudicatorBrief({ folder: round.folder })
		if ('brief' in brief)
			return { refused: fillMessage({ template: VERDICT_MESSAGES.adjudicatorOpen, values }) }
		return {
			refused: fillMessage({
				template: PACK_MESSAGES.roundBeingWritten,
				values: { ...values, folder: round.folder },
			}),
		}
	}
	const brief = round.pack === null ? readAdjudicatorBrief({ folder: round.folder }) : undefined
	if (brief === undefined || 'absent' in brief)
		return { refused: fillMessage({ template: VERDICT_MESSAGES.notAdjudicator, values }) }
	if ('refused' in brief) return brief
	return { ...base, pack: null, adjudicator: brief.brief }
}
