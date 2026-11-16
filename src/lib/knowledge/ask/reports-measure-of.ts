import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { fillMessage } from '../standard/fill-message.ts'
import { normaliseText } from '../standard/normalise-text.ts'
import { askJudgementOf } from './ask-judgement-of.ts'
import { askRoundsOf } from './ask-rounds-of.ts'
import { REPORT_MEASURE_REFUSALS } from './ask.constants.ts'
import { readAskRequest } from './read-ask-request.ts'

import type {
	Agreed,
	AskJudgement,
	AskRound,
	ReportsMeasure,
	ReportsMeasureOfParams,
} from './ask.types.ts'

/**
 * The agreed-wrong rate of the recorded asks (D26): each ask folder whose request question equals a gold item's
 * (both normalised) and that has a round the readers answered is judged by its last such round; the rate is wrong
 * over agreed and wrong (null when nothing is judged), the unjudged counted apart. Nothing is written.
 */
export function reportsMeasureOf(
	params: ReportsMeasureOfParams,
): ReportsMeasure | { refused: string } {
	const { items, asksFolder } = params
	if (!existsSync(asksFolder) || !statSync(asksFolder).isDirectory())
		return {
			refused: fillMessage({
				template: REPORT_MEASURE_REFUSALS.noFolder,
				values: { path: asksFolder },
			}),
		}
	const goldByQuestion = new Map(
		[...items].reverse().map((item) => [normaliseText(item.question), item]),
	)
	const counts: Record<AskJudgement, number> = { agreed: 0, wrong: 0, unjudged: 0 }
	const folders = readdirSync(asksFolder, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort()
	for (const name of folders) {
		const askFolder = join(asksFolder, name)
		const request = readAskRequest({ askFolder })
		if ('refused' in request) return request
		if ('absent' in request) continue
		const item = goldByQuestion.get(normaliseText(request.request.question))
		if (item === undefined) continue
		const rounds = askRoundsOf({ askFolder })
		if ('refused' in rounds) return rounds
		const agreed = lastAgreedOf({ rounds: rounds.rounds })
		if (agreed !== undefined) counts[askJudgementOf({ item, agreed })] += 1
	}
	const judged = counts.agreed + counts.wrong
	return { ...counts, rate: judged === 0 ? null : counts.wrong / judged }
}

/**
 * What the readers agreed on in the last readers' round that answered, none when no round did: the adjudicator's
 * round is no readers' agreement and is never judged (R1-13).
 */
function lastAgreedOf(params: { rounds: AskRound[] }): Agreed | undefined {
	for (const round of [...params.rounds].reverse()) {
		if (round.verdict?.adjudicator === true) continue
		const outcome = round.verdict?.outcome
		if (outcome?.state === 'answered') return outcome.agreed
	}
	return undefined
}
