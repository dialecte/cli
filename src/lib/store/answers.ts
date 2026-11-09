/** The answers of a lot: `answers/q<k>.json`, one per answered question, each published once. */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { answerPathOf } from './answer-files.ts'
import { runAnswerHooks } from './answer-hooks.ts'
import { publishOnce, recordText, storeRefusal } from './publish.ts'
import { foldedOf, readLotTaking, refuseUnlessOneLine, refuseWrongBy } from './record-rules.ts'
import { ANSWER_LIMIT, CALLER } from './store.constants.ts'

import type { RecordAnswerParams, RecordedAnswer } from './answers.types.ts'
import type { AnswerRecord, QuestionRecord } from './store.types.ts'

export { readAnswers } from './answer-files.ts'

/**
 * Records the answer to an open question of the lot folder (33S section 4, the table) and runs the `onAnswered`
 * hooks, also on an `already` retry. Refuses (a `StoreRefusal`) every row of the table that is no answer; a hook
 * that throws leaves the answer recorded and its own error thrown.
 */
export function recordAnswer(params: RecordAnswerParams): RecordedAnswer {
	const { lotFolder } = params
	refuseWrongBy(params.by)
	const { input } = readLotTaking({ lotFolder, takes: 'answer' })
	const question = input.transitions.find(
		(transition) => transition.question?.id === params.question,
	)?.question
	if (!question)
		throw storeRefusal(`the lot ${input.identity.name} asks no question ${params.question}`)
	refuseUnlessOneLine({ text: params.answer, what: 'the answer', limit: ANSWER_LIMIT })
	const record: AnswerRecord = {
		question: question.id,
		answer: canonicalAnswerOf({ question, answer: params.answer }),
		by: answererOf({ question, by: params.by }),
		at: params.now.toISOString(),
	}
	const path = answerPathOf({ lotFolder, question: question.id })
	const recorded =
		sameOrRefused({ path, record }) ??
		published({ path, record, afterTemporaryWritten: params.afterTemporaryWritten })
	runAnswerHooks({ lotFolder, lot: input.identity.name, question, answer: recorded.answer })
	return recorded
}

/**
 * The answer as recorded: the option it matches trimmed and case-folded, spelt as the option is; else as given.
 * The refusal quotes the answer as given (not JSON-escaped): the text form of `lot answer` escapes it, its JSON
 * carries it as stored.
 */
function canonicalAnswerOf(params: { question: QuestionRecord; answer: string }): string {
	const { options } = params.question
	if (options === undefined) return params.answer
	const folded = foldedOf(params.answer)
	const option = options.find((each) => foldedOf(each) === folded)
	if (option === undefined)
		throw storeRefusal(
			`the answer "${params.answer}" is none of the options of ${params.question.id}: ${options.join(', ')}`,
		)
	return option
}

/** Who answers: `by`, `caller` when a caller question leaves it out; a person's answer names who gave it. */
function answererOf(params: { question: QuestionRecord; by: string | undefined }): string {
	const { question, by } = params
	if (question.audience !== 'person') return by ?? CALLER
	if (by === undefined || by === CALLER)
		throw storeRefusal(
			`${question.id} asks a person: name who answers with --by <who> (not ${CALLER})`,
		)
	return by
}

/** Publishes the record; when another answer won the name meanwhile, that one decides (already or refused). */
function published(params: {
	path: string
	record: AnswerRecord
	afterTemporaryWritten: RecordAnswerParams['afterTemporaryWritten']
}): RecordedAnswer {
	const { path, record } = params
	mkdirSync(dirname(path), { recursive: true })
	const won = publishOnce({
		path,
		text: recordText(record),
		readOnly: true,
		afterTemporaryWritten: params.afterTemporaryWritten,
	})
	if (won) return { recorded: 'new', answer: record }
	const winner = sameOrRefused({ path, record })
	if (winner === undefined) throw new Error(`the answer ${path} vanished after it was published`)
	return winner
}

/**
 * The answer recorded at `path` when it is `record`'s answer and `by` (`already`, the record as it was); a store
 * refusal naming it when it is another; undefined when none is recorded.
 */
function sameOrRefused(params: { path: string; record: AnswerRecord }): RecordedAnswer | undefined {
	const { record } = params
	const existing = readRecordedAnswer(params.path)
	if (existing === undefined) return undefined
	if (existing.answer === record.answer && existing.by === record.by)
		return { recorded: 'already', answer: existing }
	throw storeRefusal(
		`${record.question} is answered already: "${existing.answer}" by ${existing.by} at ${existing.at}`,
	)
}

/** The answer file at `path`; undefined when there is none, a store refusal when it is no answer record. */
function readRecordedAnswer(path: string): AnswerRecord | undefined {
	let text: string
	try {
		text = readFileSync(path, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
	try {
		return JSON.parse(text) as AnswerRecord
	} catch {
		throw storeRefusal(`the answer ${path} is recorded but does not parse`)
	}
}
