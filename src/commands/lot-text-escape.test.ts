/**
 * Agent text printed by `lot status`, `lot wait` and `lot answer` in the text form (R1-2, G15, case 40): a question
 * text holding a terminal escape sequence and a right-to-left override prints escaped, no raw byte; the JSON form
 * keeps the text as stored.
 */
import { HOSTILE_TEXT, QUESTION_LOT, QUESTION_NOW } from '../../test/lot-questions.constants.ts'
import { createQuestionLot, questionWith } from '../../test/lot-questions.ts'
import { createWaitTime } from '../../test/simulated-lot.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { ESCAPED_SAFE } from '../../test/unsafe-characters.constants.ts'
import { escapeReportOf } from '../../test/unsafe-characters.ts'
import { waitLot } from './lot-wait.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLot } from '../../test/lot-questions.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The lines of the status text of a lot with open questions, as it prints them. */
const STATUS_LINES = 5

/** A real lot with two open questions, both holding the hostile text. */
function lotWithHostileQuestions(): QuestionLot {
	return createQuestionLot({
		question: questionWith({ text: HOSTILE_TEXT }),
		later: [
			transitionOf({
				seq: 3,
				kind: 'question',
				question: questionWith({ id: 'q2', text: HOSTILE_TEXT }),
			}),
		],
	})
}

describe('the text form prints agent text escaped', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot status of a lot with a hostile open question -> escaped, no raw byte', () => {
		const lot = lotWithHostileQuestions()

		expect(
			escapeReportOf({
				result: runLot({ cwd: lot.workspace.repository, argv: ['status', QUESTION_LOT] }),
				lines: STATUS_LINES,
			}),
		).toEqual(ESCAPED_SAFE)
	})

	it('lot wait of a lot with a hostile open question (exit 3) -> escaped, no raw byte', async () => {
		const lot = lotWithHostileQuestions()
		const time = createWaitTime()

		await expect(
			waitLot({
				cwd: lot.workspace.repository,
				argv: [QUESTION_LOT],
				clock: time.clock,
				sleep: time.sleep,
			}).then((result) => escapeReportOf({ result, lines: STATUS_LINES })),
		).resolves.toEqual(ESCAPED_SAFE)
	})

	it('lot answer of q1 while q2 is still open with a hostile text -> the status after it prints q2 escaped, no raw byte', () => {
		const lot = lotWithHostileQuestions()

		expect(
			escapeReportOf({
				result: runLot({
					cwd: lot.workspace.repository,
					argv: ['answer', QUESTION_LOT, 'q1', 'keep'],
					now: QUESTION_NOW,
				}),
				lines: STATUS_LINES + 1,
			}),
		).toEqual(ESCAPED_SAFE)
	})
})
