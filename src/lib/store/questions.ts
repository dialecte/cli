/** A question is a transition (33S section 4): raising one publishes it, its id fixed by the transition that wins its number. */
import { storeRefusal } from './publish.ts'
import {
	closedLotRefusal,
	foldedOf,
	readLotTaking,
	refuseUnlessOneLine,
	refuseUnlessWithin,
} from './record-rules.ts'
import {
	NO_POSITION,
	QUESTION_DETAILS_LIMIT,
	QUESTION_ID_PREFIX,
	QUESTION_REASON,
	QUESTION_TEXT_LIMIT,
} from './store.constants.ts'
import { appendTransition, readTransitions } from './transitions.ts'

import type { RaiseQuestionParams, RaisedQuestion } from './questions.types.ts'
import type { QuestionRecord, Transition } from './store.types.ts'

/**
 * Publishes a `question` transition on the lot folder and returns its id and number. Refuses (a `StoreRefusal`)
 * an empty, multi-line or over-long text, an empty or multi-line station, duplicate, empty or multi-line options,
 * over-long details, a lot `committed`,
 * `canceled` or `failed`, and a lot whose registry entry is `pending`.
 */
export function raiseQuestion(params: RaiseQuestionParams): RaisedQuestion {
	const { lotFolder } = params
	refuseUnlessOneLine({ text: params.text, what: 'the question', limit: QUESTION_TEXT_LIMIT })
	refuseUnlessOneLine({ text: params.station, what: 'the station' })
	refuseWrongOptions(params.options)
	if (params.details !== undefined)
		refuseUnlessWithin({
			text: params.details,
			what: 'the details',
			limit: QUESTION_DETAILS_LIMIT,
		})
	const { input } = readLotTaking({ lotFolder, takes: 'question' })
	const { identity, registryEntry } = input
	if (registryEntry?.state === 'pending')
		throw storeRefusal(
			`the lot ${identity.name} takes no question: its hand-over ${registryEntry.name} is written: rehash it or stop the lot first`,
		)
	const transition = appendTransition({
		lotFolder,
		afterRead: params.afterRead,
		next: function questionAsked({ last }) {
			// a retry after a lost number reads the transition that won it: a closed lot takes no question
			if (last?.state === 'canceled' || last?.state === 'failed')
				throw closedLotRefusal({ name: identity.name, state: last.state, takes: 'question' })
			// k is decided again on every retry: the transitions another raiser published meanwhile count
			const question = questionRecordOf({
				transitions: readTransitions({ lotFolder }),
				asked: params,
			})
			const position = last?.position ?? NO_POSITION
			return {
				at: params.now.toISOString(),
				lot: identity.name,
				state: 'working',
				position: { ...position, station: params.station },
				cause: {
					kind: 'question',
					by: params.by,
					reason: QUESTION_REASON.replace('{id}', question.id),
				},
				question,
				simulated: identity.simulated,
			}
		},
	})
	return { id: transition.question?.id ?? '', seq: transition.seq }
}

/**
 * Throws a store refusal for an empty option, an option of more than one line, or two options equal once trimmed
 * and case-folded.
 */
function refuseWrongOptions(options: readonly string[] | undefined): void {
	if (options === undefined) return
	const seen = new Set<string>()
	for (const option of options) {
		refuseUnlessOneLine({ text: option, what: 'an option' })
		const folded = foldedOf(option)
		if (seen.has(folded))
			throw storeRefusal(`the option ${JSON.stringify(option.trim())} is given twice`)
		seen.add(folded)
	}
}

/**
 * The record of a question asked after `transitions`: id `q<k>`, `k` = 1 + the question transitions among them, then
 * the fields given, no key for a field left out.
 */
export function questionRecordOf(params: {
	transitions: readonly Transition[]
	asked: Omit<QuestionRecord, 'id'>
}): QuestionRecord {
	const { audience, station, text, options, details, ask } = params.asked
	const before = params.transitions.filter((transition) => Boolean(transition.question)).length
	return {
		id: `${QUESTION_ID_PREFIX}${before + 1}`,
		audience,
		station,
		text,
		...(options === undefined ? {} : { options }),
		...(details === undefined ? {} : { details }),
		...(ask === undefined ? {} : { ask }),
	}
}
