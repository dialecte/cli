import {
	CUT_TEXT_FLOOR,
	LONG_QUESTION,
	MULTI_LINE_QUESTION,
	MULTI_LINE_TEXT,
	QUESTION_TEXT_LIMIT,
} from '../../../../test/ask-answer-fixtures.constants.ts'
import { questionTextOf } from './question-text-of.ts'

import { describe, expect, it } from 'vitest'

import type { QuestionText } from './ask.types.ts'

const ASK = 'A-0001'

/** A question of `length` characters made of one word repeated. */
function questionOfLength(length: number): string {
	return 'word '.repeat(length).slice(0, length)
}

/** The text a question has once the ask's id is put before it. */
function fullTextOf(question: string): string {
	return `${ASK}: ${question}`
}

const WHOLE_ROWS: Record<string, { question: string; expected: QuestionText }> = {
	'a short question -> the ask id, a colon and the question; no details': {
		question: 'Explain the intent of AA_1',
		expected: { text: 'A-0001: Explain the intent of AA_1', details: null },
	},
	'a question that makes a text of exactly 500 characters -> kept whole; no details': {
		question: questionOfLength(QUESTION_TEXT_LIMIT - ASK.length - 2),
		expected: {
			text: fullTextOf(questionOfLength(QUESTION_TEXT_LIMIT - ASK.length - 2)),
			details: null,
		},
	},
	'a question over two lines -> one line, the line break folded to a space; no details': {
		question: MULTI_LINE_QUESTION,
		expected: { text: MULTI_LINE_TEXT, details: null },
	},
}

/** Whether `text` is `full` cut before a space, within the limit and not cut short. */
function isCutAtWord(full: string): (text: string) => boolean {
	return function cutAtWord(text: string): boolean {
		return (
			text.length <= QUESTION_TEXT_LIMIT &&
			text.length >= CUT_TEXT_FLOOR &&
			full.startsWith(text) &&
			full.at(text.length) === ' ' &&
			!text.endsWith(' ')
		)
	}
}

describe('questionTextOf: the text of the question a person gets', () => {
	it.each(Object.entries(WHOLE_ROWS))('%s', (_title, row) => {
		expect(questionTextOf({ question: row.question, ask: ASK })).toEqual(row.expected)
	})

	it('a question of 501 characters or more -> the text is at most 500 characters, cut before a space', () => {
		expect(
			isCutAtWord(fullTextOf(LONG_QUESTION))(
				questionTextOf({ question: LONG_QUESTION, ask: ASK }).text,
			),
		).toBe(true)
	})

	it('a question of 501 characters or more -> the full text, ask id included, is in details', () => {
		expect(questionTextOf({ question: LONG_QUESTION, ask: ASK }).details).toBe(
			fullTextOf(LONG_QUESTION),
		)
	})

	it('a question that is one word over 500 characters (no space to cut at) -> the text is at most 500 characters, the full text in details', () => {
		const question = 'x'.repeat(QUESTION_TEXT_LIMIT + 100)

		expect(questionTextOf({ question, ask: ASK })).toEqual({
			text: fullTextOf(question).slice(0, QUESTION_TEXT_LIMIT),
			details: fullTextOf(question),
		})
	})

	it('a short word then a word of 600 characters -> cut hard at exactly 500 characters, never back to the short word', () => {
		const question = `short ${'x'.repeat(600)}`

		expect(questionTextOf({ question, ask: ASK })).toEqual({
			text: fullTextOf(question).slice(0, QUESTION_TEXT_LIMIT),
			details: fullTextOf(question),
		})
	})
})
