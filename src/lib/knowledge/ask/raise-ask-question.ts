import { relative } from 'node:path'

import { printLines } from '../../print/print.ts'
import { readAnswers } from '../../store/answer-files.ts'
import { raiseQuestion } from '../../store/questions.ts'
import { QUESTION_DETAILS_LIMIT } from '../../store/store.constants.ts'
import { readTransitions } from '../../store/transitions.ts'
import { fillMessage } from '../standard/fill-message.ts'
import {
	ASK_QUESTION_RAISER,
	ASK_QUESTION_STATION,
	DETAILS_LINE_SEPARATOR,
	LOT_ANSWER_NEXT,
	QUESTION_RAISE_FAILURE,
	QUESTION_VERDICT_POINTER,
} from './ask.constants.ts'
import { questionTextOf } from './question-text-of.ts'

import type { PersonRouteParams, RaiseAskQuestionParams } from './ask.types.ts'

/**
 * Rung 6 in a store lot (spec section 18, "Rev 5 rules"): raises one question for the person on the lot, its text
 * `<ask>: <question>` cut at 500 characters (the full text in its details), `ask` set so `lot answer` records the
 * person's fact through the ask's answer hook. The `pointer` lines (J-3: where the round's verdict is, never a
 * reader's text) follow the full text in the details, cut to the details limit. Never twice for one ask (J-2): an
 * open question of the lot naming this ask is answered as it is, nothing raised. A lot that takes no question prints
 * the line on standard error; the command's exit code is kept. Answers the question's id, or null when none is open.
 */
export function raiseAskQuestion(params: RaiseAskQuestionParams): string | null {
	const { ask } = params
	const open = openQuestionOf({ lotFolder: params.lotFolder, ask })
	if (open !== undefined) return open
	const text = questionTextOf({ question: params.question, ask })
	const pointer = params.pointer ?? []
	const details =
		pointer.length === 0
			? text.details
			: [text.details ?? text.text, ...pointer]
					.join(DETAILS_LINE_SEPARATOR)
					.slice(0, QUESTION_DETAILS_LIMIT)
	try {
		return raiseQuestion({
			lotFolder: params.lotFolder,
			audience: 'person',
			station: ASK_QUESTION_STATION,
			text: text.text,
			...(details === null ? {} : { details }),
			ask,
			now: params.now?.() ?? new Date(),
			by: ASK_QUESTION_RAISER,
		}).id
	} catch (error) {
		printLines({
			stream: 'stderr',
			lines: [
				fillMessage({
					template: QUESTION_RAISE_FAILURE,
					values: { ask, reason: error instanceof Error ? error.message : String(error) },
				}),
			],
		})
		return null
	}
}

/**
 * The person route of a store lot (J-13, J-14: the verdict, its re-run and the pack share it): the ask's question
 * raised once (J-2), `<ask>: <question>` with a pointer to the round's verdict.json relative to the lot folder (J-9,
 * J-12); answers the `lot answer` next of that question, or null when none could be raised.
 */
export function personRouteNextOf(params: PersonRouteParams): string | null {
	const raised = raiseAskQuestion({
		lotFolder: params.lotFolder,
		ask: params.ask,
		question: params.question,
		now: params.now,
		pointer: [
			fillMessage({
				template: QUESTION_VERDICT_POINTER,
				values: { path: relative(params.lotFolder, params.verdictPath) },
			}),
		],
	})
	if (raised === null) return null
	return fillMessage({
		template: LOT_ANSWER_NEXT,
		values: { lot: params.lotName, question: raised },
	})
}

/**
 * The id of a question of the lot that names the ask and has no answer yet; undefined when none (or when the lot
 * does not read: the raise then names what fails).
 */
function openQuestionOf(params: { lotFolder: string; ask: string }): string | undefined {
	try {
		const answered = new Set(
			readAnswers({ lotFolder: params.lotFolder }).map((answer) => answer.question),
		)
		return readTransitions({ lotFolder: params.lotFolder })
			.flatMap((transition) => (transition.question === null ? [] : [transition.question]))
			.find((question) => question.ask === params.ask && !answered.has(question.id))?.id
	} catch {
		return undefined
	}
}
