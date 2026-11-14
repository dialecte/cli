import { answerFromDialecte } from './answer-from-dialecte.ts'
import { answerRungOne } from './answer-rung-one.ts'
import { KIND_SLOT_NEEDS, UNANSWERED_RERUN } from './ask.constants.ts'
import { readQuestion } from './read-question.ts'

import type { AskKind, AskSubject, RerunAnswer, RerunRungParams } from './ask.types.ts'

/**
 * Asks a fact's question again at the rung that answered it (D9): its stored subject read in the dialecte (the
 * kind its shape gives, else the fact's kind forced), then rung 1 or rung 2; unanswered when the question no
 * longer reads or the rung no longer answers.
 */
export function rerunRung(params: RerunRungParams): RerunAnswer {
	const { question, rung, setup } = params
	const kind = askKindOf({ kind: params.kind })
	if (kind === undefined) return UNANSWERED_RERUN
	const subject: AskSubject = {
		tags: params.subject.tags,
		attributes: params.subject.attributes,
		values: [],
		codes: params.subject.codes,
		methods: params.subject.methods,
	}
	const packageName = params.subject.package ?? undefined
	const shaped = readQuestion({ question, subject, packageName, decision: false, setup })
	const read =
		'refused' in shaped || shaped.kind !== kind
			? readQuestion({ question, subject, kind, packageName, decision: false, setup })
			: shaped
	if ('refused' in read) return UNANSWERED_RERUN
	const answered =
		rung === 1
			? answerRungOne({ read, setup })
			: answerFromDialecte({
					kind,
					slots: read.slots,
					request: { question, packageName: read.context.package ?? packageName },
					setup,
				})
	if (answered === undefined || !('answer' in answered)) return UNANSWERED_RERUN
	return { answer: answered }
}

/** A stored kind as the ask's kind; undefined when the ask has no such kind. */
function askKindOf(params: { kind: string }): AskKind | undefined {
	return Object.hasOwn(KIND_SLOT_NEEDS, params.kind) ? (params.kind as AskKind) : undefined
}
