/**
 * Agent text on the verbs that print none of it (R1-2): `lot stop` with a hostile reason and `lot status` of a failed
 * lot with a hostile reason print no raw terminal byte, and the JSON of a lot keeps a hostile question text as stored.
 */
import { failedTransitionFor } from '../../test/inbox-workspace.ts'
import { HOSTILE_TEXT, QUESTION_LOT } from '../../test/lot-questions.constants.ts'
import { createQuestionLot, questionWith } from '../../test/lot-questions.ts'
import { withJson } from '../../test/lot-start-workspace.ts'
import { stopOf } from '../../test/lot-stop-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { unsafeCharactersIn } from '../../test/unsafe-characters.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The lines `lot stop` prints, and the status text of a failed lot. */
const STOP_LINES = 4
const FAILED_STATUS_LINES = 4

describe('agent text the verbs do not print', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot stop with a reason holding an escape sequence and an override -> no raw byte in the output', () => {
		const lot = createQuestionLot()

		expect(
			unsafeCharactersIn({
				text: stopOf({ cwd: lot.workspace.repository, id: QUESTION_LOT, reason: HOSTILE_TEXT })
					.output,
				lines: STOP_LINES,
			}),
		).toEqual([])
	})

	it('lot status of a failed lot whose reason holds them -> no raw byte in the output', () => {
		const lot = createQuestionLot({
			later: [failedTransitionFor({ seq: 2, reason: HOSTILE_TEXT })],
		})

		expect(
			unsafeCharactersIn({
				text: runLot({ cwd: lot.workspace.repository, argv: ['status', QUESTION_LOT] }).output,
				lines: FAILED_STATUS_LINES,
			}),
		).toEqual([])
	})

	it('lot status --json of a lot with a hostile question -> the text as stored', () => {
		const lot = createQuestionLot({ question: questionWith({ text: HOSTILE_TEXT }) })

		expect(
			withJson(runLot({ cwd: lot.workspace.repository, argv: ['status', QUESTION_LOT, '--json'] }))
				.json,
		).toMatchObject({ questions: [{ id: 'q1', text: HOSTILE_TEXT }] })
	})
})
