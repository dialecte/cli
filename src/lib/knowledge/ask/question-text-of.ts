import { QUESTION_TEXT_LIMIT } from '../../store/store.constants.ts'
import { fillMessage } from '../standard/fill-message.ts'
import {
	LINE_BREAK_REPLACEMENT,
	LINE_BREAKS_PATTERN,
	PERSON_QUESTION_TEMPLATE,
	QUESTION_CUT_FLOOR,
	WORD_SEPARATOR,
} from './ask.constants.ts'

import type { QuestionText, QuestionTextOfParams } from './ask.types.ts'

/**
 * The text of the question a person gets at rung 6 (R4-12): `<ask>: <question>` on one line, at most 500
 * characters, cut at a word, the full text in `details` when it was cut. A first word longer than the limit is cut
 * hard at the limit; a cut never goes back past more than one word.
 */
export function questionTextOf(params: QuestionTextOfParams): QuestionText {
	const full = fillMessage({
		template: PERSON_QUESTION_TEMPLATE,
		values: {
			ask: params.ask,
			question: params.question.trim().replace(LINE_BREAKS_PATTERN, LINE_BREAK_REPLACEMENT),
		},
	})
	if (full.length <= QUESTION_TEXT_LIMIT) return { text: full, details: null }
	return { text: cutAtWord({ text: full }), details: full }
}

/**
 * The text cut before the last space within the limit, so a word is never split (D41: no ellipsis); cut hard at the
 * limit when that space would keep fewer than `QUESTION_CUT_FLOOR` characters (one very long word).
 */
function cutAtWord(params: { text: string }): string {
	const { text } = params
	// a space just past the limit: the text up to the limit ends a word
	if (text.at(QUESTION_TEXT_LIMIT) === WORD_SEPARATOR) return text.slice(0, QUESTION_TEXT_LIMIT)
	const space = text.lastIndexOf(WORD_SEPARATOR, QUESTION_TEXT_LIMIT - 1)
	if (space < QUESTION_CUT_FLOOR) return text.slice(0, QUESTION_TEXT_LIMIT)
	return text.slice(0, space)
}
