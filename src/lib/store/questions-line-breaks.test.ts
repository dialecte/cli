/**
 * `raiseQuestion` follows the one-line rule of the question text for its options and its station (R3-3): a line
 * break (LF, CRLF, lone CR) in either is refused as a store refusal, and nothing is published.
 */
import { QUESTION_NOW, QUESTION_TEXT } from '../../../test/lot-questions.constants.ts'
import { createQuestionLot } from '../../../test/lot-questions.ts'
import { snapshotOf } from '../../../test/lot-start-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { thrownBy } from '../../../test/thrown-by.ts'
import { raiseQuestion } from './questions.ts'
import { STORE_REFUSAL } from './store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RaiseQuestionParams } from './questions.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const ROWS = [
	{ title: 'an option with a line feed', overrides: { options: ['accept', 'fix\nit'] } },
	{ title: 'an option with a CRLF', overrides: { options: ['accept', 'fix\r\nit'] } },
	{ title: 'an option with a lone CR', overrides: { options: ['accept', 'fix\rit'] } },
	{ title: 'a station with a line feed', overrides: { station: 'test-reviewer\nnext: x' } },
	{ title: 'a station with a CRLF', overrides: { station: 'test-reviewer\r\nnext: x' } },
	{ title: 'a station with a lone CR', overrides: { station: 'test-reviewer\rnext: x' } },
]

describe(
	'raiseQuestion: line breaks in options and station',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of ROWS)
			it(`${row.title} -> refused as a store refusal, nothing published`, () => {
				const { lotFolder } = createQuestionLot()
				const before = snapshotOf(lotFolder)
				const asked: RaiseQuestionParams = {
					lotFolder,
					audience: 'caller',
					station: 'test-reviewer',
					text: QUESTION_TEXT,
					now: QUESTION_NOW,
					by: 'test-reviewer',
					...row.overrides,
				}

				expect(thrownBy(() => raiseQuestion(asked))).toMatchObject({
					name: STORE_REFUSAL,
					message: expect.stringMatching(/one line/),
				})
				expect(snapshotOf(lotFolder)).toEqual(before)
			})
	},
)
