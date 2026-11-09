/**
 * The answers of a lot folder as decision rows (33S section 4, Answers): never copied into `decisions.md`, the
 * readers render them after its own rows. Reads only.
 */
import { readAnswers } from '../store/answers.ts'
import { lotFolderOf } from '../store/lot-folder.ts'
import { readTransitions } from '../store/transitions.ts'
import {
	ANSWER_DECISION,
	ANSWER_DECISION_WITHOUT_QUESTION,
	ANSWER_PLACEHOLDER_PATTERN,
	UTC_DAY_LENGTH,
} from './recap.constants.ts'

import type { DecisionRow } from '../review-rounds/review-rounds.types.ts'

/**
 * One row per `answers/q<k>.json` of the lot folder `folder`, ordered by `k`: `q<k> <question text> -> <answer>`
 * (`q<k> -> <answer>` when no transition names the question), by the answer's `by`, on the UTC day of its `at`.
 * None for a folder that is no lot folder.
 */
export function readLotAnswerDecisions(params: { folder: string }): DecisionRow[] {
	const lotFolder = lotFolderOf(params)
	if (lotFolder === undefined) return []
	const transitions = readTransitions({ lotFolder })
	return readAnswers({ lotFolder }).map(function decisionOf(answer) {
		const text = transitions.find((transition) => transition.question?.id === answer.question)
			?.question?.text
		const template = text === undefined ? ANSWER_DECISION_WITHOUT_QUESTION : ANSWER_DECISION
		const values: Record<string, string> = {
			question: answer.question,
			text: text ?? '',
			answer: answer.answer,
		}
		return {
			// one pass, a function per placeholder: free text is printed as written, never read as a pattern
			decision: template.replace(ANSWER_PLACEHOLDER_PATTERN, function valueOf(_whole, key: string) {
				return values[key]
			}),
			by: answer.by,
			when: utcDayOf(answer.at),
		}
	})
}

/** The UTC day (`yyyy-mm-dd`) of an ISO time; empty when it is missing or no time. */
function utcDayOf(at: string | undefined): string {
	const time = at === undefined ? Number.NaN : Date.parse(at)
	return Number.isNaN(time) ? '' : new Date(time).toISOString().slice(0, UTC_DAY_LENGTH)
}
