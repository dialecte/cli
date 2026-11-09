/**
 * `raiseQuestion` that loses its transition number to a `canceled` or `failed` transition (R1-4, forced order through
 * its `afterRead` seam): the retry is refused naming the state and publishes nothing, so the closed lot never reads
 * `input-required` again.
 */
import { QUESTION_NOW } from '../../../test/lot-questions.constants.ts'
import { createQuestionLot, transitionFilesOf } from '../../../test/lot-questions.ts'
import { transitionOf, writeRecordFile } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { thrownBy } from '../../../test/thrown-by.ts'
import { raiseQuestion } from './questions.ts'
import { STORE_REFUSAL } from './store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { EngineState, TransitionCauseKind } from './store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe(
	'raiseQuestion: the number is taken by a closing transition',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const [state, kind] of [
			['canceled', 'stop'],
			['failed', 'fail'],
		] as [EngineState, TransitionCauseKind][])
			it(`${state} published between the read and the publish -> the raise is refused naming ${state}, no question transition after it`, () => {
				const { lotFolder } = createQuestionLot()

				expect(
					thrownBy(() =>
						raiseQuestion({
							lotFolder,
							audience: 'caller',
							station: 'test-reviewer',
							text: 'keep an existing entry as it is?',
							now: QUESTION_NOW,
							by: 'test-reviewer',
							afterRead: function closeTheLot() {
								writeRecordFile({
									folder: lotFolder,
									name: 'transitions/000002.json',
									text: `${JSON.stringify(transitionOf({ seq: 2, state, kind }))}\n`,
								})
							},
						}),
					),
				).toMatchObject({ name: STORE_REFUSAL, message: expect.stringContaining(state) })
				expect(transitionFilesOf(lotFolder).map((transition) => transition.state)).toEqual([
					'working',
					state,
				])
			})
	},
)
