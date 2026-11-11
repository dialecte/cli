/**
 * The refusals of `lot answer` print agent text escaped (R2-2, R3-1): the options of a question and a recorded answer
 * may hold a terminal escape sequence, a right-to-left override and a line feed; the text form of the exit 2 is one
 * line holding no raw unsafe character, the JSON form keeps the text as stored.
 */
import {
	HOSTILE_LINES_TEXT,
	HOSTILE_OPTIONS,
	HOSTILE_TEXT,
	QUESTION_LOT,
	QUESTION_NOW,
	REFUSAL_LINES,
} from '../../test/lot-questions.constants.ts'
import {
	createQuestionLot,
	questionWith,
	recordedOf,
	writeAnswerFile,
} from '../../test/lot-questions.ts'
import { withJson } from '../../test/lot-start-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import {
	ESCAPED_SAFE,
	ESCAPED_SAFE_WITH_LINE_FEED,
} from '../../test/unsafe-characters.constants.ts'
import { escapeReportOf } from '../../test/unsafe-characters.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLot } from '../../test/lot-questions.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** `lot answer q1 <answer>` from the lot's repository, with the options `--json` when asked. */
function answerWith(params: { lot: QuestionLot; answer: string; json?: boolean }) {
	return runLot({
		cwd: params.lot.workspace.repository,
		argv: [
			'answer',
			QUESTION_LOT,
			'q1',
			params.answer,
			...(params.json === true ? ['--json'] : []),
		],
		now: QUESTION_NOW,
	})
}

describe('lot answer refusals print agent text escaped', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an answer matching no option, the options holding an escape sequence and an override -> exit 2, the options escaped', () => {
		const lot = createQuestionLot({ question: questionWith({ options: HOSTILE_OPTIONS }) })
		const result = answerWith({ lot, answer: 'neither' })

		expect({
			exitCode: result.exitCode,
			...escapeReportOf({ result, lines: REFUSAL_LINES }),
		}).toEqual({ exitCode: 2, ...ESCAPED_SAFE })
	})

	it('an answer holding an override matching no option -> exit 2, the answer escaped too', () => {
		const lot = createQuestionLot({ question: questionWith({ options: ['keep', 'drop'] }) })
		const result = answerWith({ lot, answer: 'ke\u{202e}p' })

		expect({
			exitCode: result.exitCode,
			unsafe: escapeReportOf({ result, lines: REFUSAL_LINES }).unsafe,
		}).toEqual({ exitCode: 2, unsafe: [] })
	})

	it('a question already answered with a hostile answer, answered again differently -> exit 2, the recorded answer escaped', () => {
		const lot = createQuestionLot({ question: questionWith() })
		writeAnswerFile({
			lotFolder: lot.lotFolder,
			record: recordedOf({ answer: HOSTILE_TEXT, by: 'a-person\u{202e}' }),
		})
		const result = answerWith({ lot, answer: 'another' })

		expect({
			exitCode: result.exitCode,
			...escapeReportOf({ result, lines: REFUSAL_LINES }),
		}).toEqual({ exitCode: 2, ...ESCAPED_SAFE })
	})

	it('an option holding a line feed (a forged question file), the answer matching none -> exit 2, still one line, the line feed shown as \\u{a}', () => {
		const lot = createQuestionLot({
			question: questionWith({ options: [HOSTILE_LINES_TEXT, 'drop'] }),
		})
		const result = answerWith({ lot, answer: 'neither' })

		expect({
			exitCode: result.exitCode,
			...escapeReportOf({ result, lines: REFUSAL_LINES }),
		}).toEqual({ exitCode: 2, ...ESCAPED_SAFE_WITH_LINE_FEED })
	})

	it('a recorded answer and a by holding a line feed, answered again differently -> exit 2, still one line, the line feed shown as \\u{a}', () => {
		const lot = createQuestionLot({ question: questionWith() })
		writeAnswerFile({
			lotFolder: lot.lotFolder,
			record: recordedOf({ answer: HOSTILE_LINES_TEXT, by: 'a-person\nnext: x' }),
		})
		const result = answerWith({ lot, answer: 'another' })

		expect({
			exitCode: result.exitCode,
			...escapeReportOf({ result, lines: REFUSAL_LINES }),
		}).toEqual({ exitCode: 2, ...ESCAPED_SAFE_WITH_LINE_FEED })
	})

	it('the same refusal under --json -> the options stay as stored in the error', () => {
		const lot = createQuestionLot({ question: questionWith({ options: HOSTILE_OPTIONS }) })
		const result = withJson(answerWith({ lot, answer: 'neither', json: true }))

		expect(result).toMatchObject({
			exitCode: 2,
			json: { error: expect.stringContaining(HOSTILE_TEXT), next: null },
		})
	})
})
