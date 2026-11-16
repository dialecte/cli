import { makeEnvelope } from '../../events/write-event.ts'
import { readCliVersion } from '../../read-cli-version.ts'
import { ASK_EVENT_KINDS, PERSON_RUNG } from './ask.constants.ts'

import type { LotEvent } from '../../events/event.types.ts'
import type {
	AskAnswerEventOfParams,
	AskFactEventOfParams,
	AskPackEventOfParams,
	AskVerdictEventOfParams,
} from './ask.types.ts'

/**
 * The `ask.pack` event of a pack (R1-16): the ask, the round, how many readers it gave and whether it was skipped
 * (nothing new to give); never the question, a slice's words or a url.
 */
export function askPackEventOf(params: AskPackEventOfParams): LotEvent {
	return {
		...envelopeOf({ lot: params.lot, kind: ASK_EVENT_KINDS.pack, now: params.now }),
		ask: params.ask,
		round: params.round,
		readers: params.readers,
		skipped: params.skipped,
	}
}

/**
 * The `ask.answer` event of a person's answer (R1-16): the ask, rung 6, the reader miss (given or not, the round) and
 * the cite's refusal; never the question, the answer, a quote or a url.
 */
export function askAnswerEventOf(params: AskAnswerEventOfParams): LotEvent {
	return {
		...envelopeOf({ lot: params.lot, kind: ASK_EVENT_KINDS.answer, now: params.now }),
		ask: params.ask,
		rung: PERSON_RUNG,
		miss: params.miss === null ? null : { given: params.miss.given, round: params.miss.round },
		citeRefused: params.citeRefused,
	}
}

/**
 * The `ask.verdict` event of a closed round (I-9): the ask, the round, its state and reason, the accepted count, the
 * refused counted by reason, the claims in polarity conflict, the adjudicator's round or not; never a text, quote or
 * url.
 */
export function askVerdictEventOf(params: AskVerdictEventOfParams): LotEvent {
	return {
		...envelopeOf({ lot: params.lot, kind: ASK_EVENT_KINDS.verdict, now: params.now }),
		ask: params.ask,
		round: params.round,
		state: params.state,
		reason: params.reason,
		accepted: params.accepted,
		refused: params.refused,
		polarityConflicts: params.polarityConflicts,
		adjudicator: params.adjudicator,
	}
}

/**
 * The `ask.fact` event of a fact a verdict recorded, in the ladder's `ask.fact` shape (J-4, J-11): no fact hit (null),
 * no candidate, the new fact's id, no stale candidate (0), and the rung (4 readers, 5 the adjudicator).
 */
export function askFactEventOf(params: AskFactEventOfParams): LotEvent {
	return {
		...envelopeOf({ lot: params.lot, kind: ASK_EVENT_KINDS.fact, now: params.now }),
		ask: params.ask,
		hit: null,
		candidates: 0,
		new: params.fact,
		stale: 0,
		rung: params.rung,
	}
}

/** The envelope of an ask event written by the cli. */
function envelopeOf(params: {
	lot: string | null
	kind: string
	now: (() => Date) | undefined
}): LotEvent {
	return makeEnvelope({
		lot: params.lot,
		kind: params.kind,
		by: 'cli',
		cli: readCliVersion(),
		simulated: false,
		hostEvent: null,
		now: params.now,
	})
}
