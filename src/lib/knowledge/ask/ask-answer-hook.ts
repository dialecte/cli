import { join } from 'node:path'

import { printLines } from '../../print/print.ts'
import { STORE_FILES } from '../../store/store.constants.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { claimAsk } from './ask-claim.ts'
import { askStateEventOf } from './ask-state-event-of.ts'
import { ANSWERED_STATE, CLAIM_MESSAGES, PERSON_RUNG } from './ask.constants.ts'
import { releaseClaim } from './claim-file.ts'
import { personAnswerTargetOf, recordPersonAnswer } from './person-answer.ts'
import { writeAskEvent } from './write-ask-event.ts'
import { rewriteLotNoteNow } from './write-standard-note.ts'

import type { AnswerHookInput } from '../../store/answer-hooks.types.ts'
import type { AnswerHookSeams } from './ask.types.ts'

/**
 * The `onAnswered` hook of a question raised for an ask (U10): on a question carrying `ask` it records the person's
 * fact as `ask answer` would (no cite), under the ask's claim (R1-6), reading the process's environment (data,
 * cache, `DIALECTE_STANDARD`), then rewrites the lot's note before it returns (R1-11: synchronous, a bounded wait on
 * the note's claim, a line on standard error past it). Idempotent: an ask already answered records nothing, and a
 * fact an earlier run recorded for the ask is published in `answer.json` as it is; a question without `ask` is left
 * alone. Throws (the answer kept, `lot answer` exits 1) when the ask cannot take the answer or another run holds it.
 */
export function askAnswerHook(input: AnswerHookInput & { seams?: AnswerHookSeams }): void {
	const { ask } = input.question
	if (ask === undefined) return
	const asksFolder = join(input.lotFolder, STORE_FILES.asks)
	const first = personAnswerTargetOf({ asksFolder, ask })
	if ('refused' in first) {
		if (first.answered) return
		throw new Error(first.refused)
	}
	const claim = claimAsk({ ask, askFolder: first.askFolder })
	// the way on names the ask answer command (R2-6): the lot keeps the answer, the person records it once the run ends
	if ('refused' in claim)
		throw new Error(
			fillMessage({
				template: CLAIM_MESSAGES.hookInProgress,
				values: { refused: claim.refused, ask },
			}),
		)
	try {
		recordedUnderClaim({ input, asksFolder, ask })
	} finally {
		releaseClaim({ path: claim.claim })
	}
	rewriteLotNoteNow({
		lotHome: input.lotFolder,
		asksFolder,
		now: undefined,
		...(input.seams?.waitLimitMs === undefined ? {} : { waitLimitMs: input.seams.waitLimitMs }),
	})
}

/** The person's answer recorded while the hook holds the ask's claim: the ask read again first (another run may have answered it). */
function recordedUnderClaim(params: {
	input: AnswerHookInput & { seams?: AnswerHookSeams }
	asksFolder: string
	ask: string
}): void {
	const { input } = params
	const target = personAnswerTargetOf({ asksFolder: params.asksFolder, ask: params.ask })
	if ('refused' in target) {
		if (target.answered) return
		throw new Error(target.refused)
	}
	const recorded = recordPersonAnswer({
		target,
		text: input.answer.answer,
		by: input.answer.by,
		cite: null,
		citeRefused: null,
		miss: null,
		environment: process.env,
		lot: input.lot,
		now: undefined,
		...(input.seams?.afterFact === undefined ? {} : { afterFact: input.seams.afterFact }),
	})
	if ('refused' in recorded) {
		if (!recorded.answered) throw new Error(recorded.refused)
		return
	}
	// the ask's state after the answer (I-9): answered at rung 6, in the lot's events
	const failure = writeAskEvent({
		file: join(input.lotFolder, STORE_FILES.events),
		event: askStateEventOf({
			ask: params.ask,
			lot: input.lot,
			state: ANSWERED_STATE,
			rung: PERSON_RUNG,
			conflict: false,
		}),
	})
	if (failure !== undefined) printLines({ stream: 'stderr', lines: [failure] })
}
