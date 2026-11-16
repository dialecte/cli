/**
 * A person's answer to an ask (rung 6, section 9): the ask it answers read first, then the person fact recorded in
 * the ledger and the ask's `answer.json` published once. Shared by `ask answer` and the answer hook of `lot answer`.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { publishOnce, recordText } from '../../store/publish.ts'
import { factsFolder, factsFolderRefusal } from '../facts/data-folder.ts'
import { factKeyOf } from '../facts/fact-key.ts'
import { recordFact } from '../facts/record-fact.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { askStateOf } from './ask-state-of.ts'
import {
	ANSWER_RECORD_FILE,
	ANSWERED_STATE,
	ASK_ID_PATTERN,
	CONFIRM_RECORD_FILE,
	PERSON_ANSWER_MESSAGES,
	PERSON_RUNG,
	PERSON_VERDICT,
	VERDICT_VALUE,
} from './ask.constants.ts'
import { readAskRecord } from './read-ask-record.ts'
import { readAskRequest } from './read-ask-request.ts'
import {
	readPersonAnsweringMarker,
	recordedFactOfKey,
	removeAnsweringMarker,
	writePersonAnsweringMarker,
} from './recorded-fact-of-ask.ts'
import { requestSubjectOf } from './request-subject-of.ts'

import type { FactDraft } from '../facts/facts.types.ts'
import type {
	AnswerRecord,
	ConfirmRecord,
	PersonAnswerRefusal,
	PersonAnswerTarget,
	PersonAnswerTargetOfParams,
	PersonFactBy,
	PublishPersonAnswerParams,
	RecordedPersonAnswer,
	RecordedPersonFact,
	RecordPersonAnswerParams,
} from './ask.types.ts'

/**
 * The ask a person answers: its record, its request and its state now; refused (nothing recorded) for an ask no
 * folder holds, one made before the readers, one answered, or a record that does not read.
 */
export function personAnswerTargetOf(
	params: PersonAnswerTargetOfParams,
): PersonAnswerTarget | PersonAnswerRefusal {
	const { ask, asksFolder } = params
	const askFolder = join(asksFolder, ask)
	const record = ASK_ID_PATTERN.test(ask) ? readAskRecord({ askFolder }) : { absent: true as const }
	if ('absent' in record)
		return refusal({
			template: PERSON_ANSWER_MESSAGES.unknownAsk,
			values: { ask, folder: asksFolder },
		})
	if ('refused' in record) return { refused: record.refused, answered: false }
	const request = readAskRequest({ askFolder })
	if ('refused' in request) return { refused: request.refused, answered: false }
	if ('absent' in request)
		return refusal({
			template: PERSON_ANSWER_MESSAGES.noRequest,
			values: { ask, question: record.record.question },
		})
	const state = askStateOf({ askFolder })
	const target = { ask, askFolder, record: record.record, request: request.request, state }
	if (state.state !== ANSWERED_STATE) return { ...target, confirms: null }
	if (existsSync(join(askFolder, CONFIRM_RECORD_FILE)))
		return {
			refused: fillMessage({
				template: PERSON_ANSWER_MESSAGES.confirmed,
				values: { ask, fact: state.fact ?? '' },
			}),
			answered: true,
		}
	// an ask the outside readers answered takes the person's confirmation (U17); any other answered ask is refused
	if (state.source === 'outside' && !existsSync(join(askFolder, ANSWER_RECORD_FILE)))
		return { ...target, confirms: state.fact }
	return answeredRefusal({ ask, fact: state.fact })
}

/**
 * Records a person's answer: the person's fact (`recordPersonFact`), the `afterFact` seam, then `answer.json`
 * (`publishPersonAnswer`). Refused when the ledger cannot be written, or another answer was published first. The
 * caller holds the ask's claim (`claimAsk`).
 */
export function recordPersonAnswer(params: RecordPersonAnswerParams): RecordedPersonAnswer {
	const recorded = recordPersonFact(params)
	if ('refused' in recorded) return recorded
	params.afterFact?.()
	return publishPersonAnswer({ ...params, fact: recorded.fact })
}

/**
 * The person's fact of an answer: a `person` fact by who answered (rung 6) holding the text, its verified cite as
 * evidence, `unchecked: true` unless the ask went to readers of the documents (32e: an outside ask, a
 * `--person-only` one). The ask's `answering` marker naming the draft's key is published first (R2-7): a retry after
 * a crash before `answer.json` finds the fact by it and records nothing anew (R1-6). Refused when the ledger cannot
 * be written.
 */
export function recordPersonFact(params: RecordPersonAnswerParams): RecordedPersonFact {
	const { target, environment } = params
	const folder = factsFolder({ environment, home: environment.HOME || undefined })
	const ledgerRefusal = factsFolderRefusal({ folder })
	if (ledgerRefusal !== undefined) return { refused: ledgerRefusal, answered: false }
	const marker = readPersonAnsweringMarker({ askFolder: target.askFolder })
	const earlier =
		marker?.ask === target.ask
			? recordedFactOfKey({ folder, ask: target.ask, lot: params.lot, key: marker.key })
			: undefined
	if (earlier !== undefined) return { fact: earlier }
	const draft = personDraftOf(params)
	writePersonAnsweringMarker({
		askFolder: target.askFolder,
		ask: target.ask,
		key: factKeyOf({
			question: draft.question,
			subject: draft.subject,
			kind: draft.kind,
			package: draft.subject.package,
		}),
	})
	const recorded = recordFact({
		folder,
		draft,
		lot: params.lot,
		ask: target.ask,
		...(params.now === undefined ? {} : { now: params.now }),
	})
	return { fact: recorded.id }
}

/** Publishes the ask's `answer.json` once, naming the fact; refused when another answer was published first. */
export function publishPersonAnswer(params: PublishPersonAnswerParams): RecordedPersonAnswer {
	const { target } = params
	if (target.confirms !== null) return publishConfirmation(params)
	const record: AnswerRecord = {
		schema: 1,
		ask: target.ask,
		by: params.by,
		text: params.text,
		cite: params.cite,
		citeRefused: params.citeRefused,
		miss: params.miss,
		fact: params.fact,
		at: (params.now?.() ?? new Date()).toISOString(),
	}
	const published = publishOnce({
		path: join(target.askFolder, ANSWER_RECORD_FILE),
		text: recordText(record),
		readOnly: false,
	})
	if (!published) return answeredRefusal({ ask: target.ask, fact: null })
	removeAnsweringMarker({ folder: target.askFolder })
	return { fact: params.fact, record }
}

/**
 * The confirmation of an outside answer (U17): `confirm.json` (schema 1, the ask, the person's fact that superseded
 * the outside one, who, when) published once; refused naming the ask confirmed when one was published first.
 */
function publishConfirmation(params: PublishPersonAnswerParams): RecordedPersonAnswer {
	const { target } = params
	const at = (params.now?.() ?? new Date()).toISOString()
	const confirm: ConfirmRecord = {
		schema: 1,
		ask: target.ask,
		fact: params.fact,
		by: params.by,
		at,
	}
	const published = publishOnce({
		path: join(target.askFolder, CONFIRM_RECORD_FILE),
		text: recordText(confirm),
		readOnly: false,
	})
	if (!published)
		return {
			refused: fillMessage({
				template: PERSON_ANSWER_MESSAGES.confirmed,
				values: { ask: target.ask, fact: params.fact },
			}),
			answered: true,
		}
	removeAnsweringMarker({ folder: target.askFolder })
	const record: AnswerRecord = {
		schema: 1,
		ask: target.ask,
		by: params.by,
		text: params.text,
		cite: params.cite,
		citeRefused: params.citeRefused,
		miss: params.miss,
		fact: params.fact,
		at,
	}
	return { fact: params.fact, record }
}

/**
 * The person's fact as drafted: the ask's question, subject, kind and effort, the text, who answered; its verdict the
 * one `--verdict` gave (U19: `value` holding the answer as its value), else `person`; `unchecked` unless the ask read
 * documents, a person confirming an outside answer too (J-16: confirm.json marks the ask confirmed).
 */
function personDraftOf(params: RecordPersonAnswerParams): FactDraft {
	const { target } = params
	const { request } = target
	const by: PersonFactBy = { rung: PERSON_RUNG, person: params.by }
	const verified = params.cite !== null && params.citeRefused === null ? [params.cite] : []
	const verdict = params.verdict ?? null
	// without documents the fact stays unchecked, a confirmation too (J-16: re-asked once documents exist)
	const checked = target.state.source === 'documents'
	return {
		question: request.question,
		subject: requestSubjectOf({ request, recorded: target.record.subject }),
		kind: request.kind,
		answer: {
			verdict: verdict ?? PERSON_VERDICT,
			value: verdict === VERDICT_VALUE ? params.text : null,
			text: params.text,
		},
		source: 'person',
		effort: request.effort,
		evidence: verified,
		by,
		sources: [],
		...(checked ? {} : { unchecked: true as const }),
	}
}

function answeredRefusal(params: { ask: string; fact: string | null }): PersonAnswerRefusal {
	const { fact } = params
	return {
		refused: fillMessage({
			template: PERSON_ANSWER_MESSAGES.answered,
			values: {
				ask: params.ask,
				fact:
					fact === null
						? ''
						: fillMessage({ template: PERSON_ANSWER_MESSAGES.answeredFact, values: { fact } }),
			},
		}),
		answered: true,
	}
}

function refusal(params: {
	template: string
	values: Record<string, string>
}): PersonAnswerRefusal {
	return { refused: fillMessage(params), answered: false }
}
