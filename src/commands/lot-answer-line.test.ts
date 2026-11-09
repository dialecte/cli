/**
 * The answer line a status names for an open question (R1-10): a caller question's carries no `--by` (it defaults to
 * the caller), a person's keeps `--by <who>`.
 */
import {
	KEEP_OR_REPLACE,
	PERSON_ACCEPT_OR_FIX,
	QUESTION_LOT,
} from '../../test/lot-questions.constants.ts'
import { createQuestionLot } from '../../test/lot-questions.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { lotStatusOf } from './lot-status.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('the answer line of an open question', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a caller question has no --by, a person question keeps --by <who>', () => {
		const caller = createQuestionLot({ question: KEEP_OR_REPLACE })
		const person = createQuestionLot({ question: PERSON_ACCEPT_OR_FIX })

		expect({
			caller: lotStatusOf({ lotFolder: caller.lotFolder })?.next,
			person: lotStatusOf({ lotFolder: person.lotFolder })?.next,
		}).toEqual({
			caller: `dialecte lot answer ${QUESTION_LOT} q1 "<answer>"`,
			person: `dialecte lot answer ${QUESTION_LOT} q1 "<answer>" --by <who>`,
		})
	})
})
