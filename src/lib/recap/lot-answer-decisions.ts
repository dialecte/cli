/**
 * The answers of a lot folder as decision rows (33S section 4, Answers): never copied into `decisions.md`, the
 * readers render them after its own rows. Reads only.
 */
import { lotFolderOf } from '../store/lot-folder.ts'
import { readCheckedLotState, registryOfLotFolder } from '../store/lot-records.ts'
import {
	ANSWER_DECISION,
	ANSWER_DECISION_WITHOUT_QUESTION,
	ANSWER_PLACEHOLDER_PATTERN,
	UTC_DAY_LENGTH,
} from './recap.constants.ts'

import type { DecisionRow } from '../review-rounds/review-rounds.types.ts'

/**
 * One row per `answers/q<k>.json` of the lot folder `folder`, ordered by `k`: `q<k> <question text> -> <answer>`
 * (`q<k> -> <answer>` when no transition names the question), by the answer's `by`, on the UTC day of its `at`;
 * a field a damaged file lacks renders empty.
 * None for a folder that is no lot folder.
 */
export function readLotAnswerDecisions(params: { folder: string }): DecisionRow[] {
	const lotFolder = lotFolderOf(params)
	if (lotFolder === undefined) return []
	// read as every reader of a lot reads it, its records checked once: a damaged lot gives no row
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	if (checked === undefined || !('input' in checked)) return []
	const { transitions, answers } = checked.input
	return answers.map(function decisionOf(answer) {
		const text = transitions.find((transition) => transition.question?.id === answer.question)
			?.question?.text
		const template = text === undefined ? ANSWER_DECISION_WITHOUT_QUESTION : ANSWER_DECISION
		const values: Record<string, string> = {
			question: answer.question,
			text: text ?? '',
			answer: textOrEmpty(answer.answer),
		}
		return {
			// one pass, a function per placeholder: free text is printed as written, never read as a pattern
			decision: template.replace(ANSWER_PLACEHOLDER_PATTERN, function valueOf(_whole, key: string) {
				return values[key]
			}),
			by: textOrEmpty(answer.by),
			when: utcDayOf(answer.at),
		}
	})
}

/** A field of an answer file as text: empty when a damaged file left it out or holds no text there. */
function textOrEmpty(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

/** The UTC day (`yyyy-mm-dd`) of an ISO time; empty when it is missing or no time. */
function utcDayOf(at: string | undefined): string {
	const time = at === undefined ? Number.NaN : Date.parse(at)
	return Number.isNaN(time) ? '' : new Date(time).toISOString().slice(0, UTC_DAY_LENGTH)
}
