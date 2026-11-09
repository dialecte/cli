/**
 * The `onAnswered` hooks (33S section 4): they run after an answer is published and on every `already` retry, in
 * the order registered, with the lot folder, the lot, the question and the recorded answer; a hook that throws
 * leaves the answer recorded and its own error with the caller.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { withAnswerHooks } from '../../../test/answer-hook-scope.ts'
import { outcomeOf } from '../../../test/call-outcome.ts'
import {
	HOOK_MESSAGE,
	KEEP_OR_REPLACE,
	QUESTION_LOT,
	QUESTION_NOW,
} from '../../../test/lot-questions.constants.ts'
import {
	answerParamsOf,
	createQuestionLot,
	readAnswerFile,
	writeAnswerFile,
} from '../../../test/lot-questions.ts'
import { RECORD_TIME } from '../../../test/store-records.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { thrownBy } from '../../../test/thrown-by.ts'
import { registerAnswerHook } from './answer-hooks.ts'
import { recordAnswer } from './answers.ts'
import { STORE_REFUSAL } from './store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RecordingHook } from '../../../test/lot-questions.types.ts'
import type { AnswerHookInput } from './answer-hooks.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const QUESTION = KEEP_OR_REPLACE

/** A hook that keeps what it receives, and whether the answer file was there when it ran. */
function recordingHook(): RecordingHook {
	const calls: AnswerHookInput[] = []
	const sawFile: boolean[] = []
	return {
		calls,
		sawFile,
		hook: function record(input) {
			calls.push(input)
			sawFile.push(existsSync(join(input.lotFolder, 'answers', 'q1.json')))
		},
	}
}

describe('answer hooks', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a hook and a new answer -> it runs once, with { lotFolder, lot, question, answer }, the answer already on disk', () => {
		const { lotFolder } = createQuestionLot({ question: QUESTION })
		const recording = recordingHook()

		expect(
			outcomeOf(() =>
				withAnswerHooks({
					hooks: [recording.hook],
					action: () => recordAnswer(answerParamsOf({ lotFolder })),
				}),
			),
		).toMatchObject({ value: { recorded: 'new' } })
		expect(recording.calls).toEqual([
			{
				lotFolder,
				lot: QUESTION_LOT,
				question: QUESTION,
				answer: { question: 'q1', answer: 'keep', by: 'caller', at: QUESTION_NOW.toISOString() },
			},
		])
		expect(recording.sawFile).toEqual([true])
	})

	it('a hook and an answer recorded already -> it runs again, with the answer as recorded (a crash before the hooks is repaired by the retry)', () => {
		const { lotFolder } = createQuestionLot({ question: QUESTION })
		writeAnswerFile({
			lotFolder,
			record: { question: 'q1', answer: 'keep', by: 'caller', at: RECORD_TIME },
		})
		const recording = recordingHook()

		expect(
			outcomeOf(() =>
				withAnswerHooks({
					hooks: [recording.hook],
					action: () => recordAnswer(answerParamsOf({ lotFolder })),
				}),
			),
		).toMatchObject({ value: { recorded: 'already' } })
		expect(recording.calls.map((call) => call.answer)).toEqual([
			{ question: 'q1', answer: 'keep', by: 'caller', at: RECORD_TIME },
		])
	})

	it('a new answer, then the same again -> the hook ran twice', () => {
		const { lotFolder } = createQuestionLot({ question: QUESTION })
		const recording = recordingHook()

		expect(
			outcomeOf(() =>
				withAnswerHooks({
					hooks: [recording.hook],
					action: () => {
						recordAnswer(answerParamsOf({ lotFolder }))
						return recordAnswer(answerParamsOf({ lotFolder }))
					},
				}),
			),
		).toMatchObject({ value: { recorded: 'already' } })
		expect(recording.calls).toHaveLength(2)
	})

	it('two hooks -> both run, in the order they were registered', () => {
		const { lotFolder } = createQuestionLot({ question: QUESTION })
		const order: string[] = []

		expect(
			outcomeOf(() =>
				withAnswerHooks({
					hooks: [
						function first() {
							order.push('first')
						},
						function second() {
							order.push('second')
						},
					],
					action: () => recordAnswer(answerParamsOf({ lotFolder })),
				}),
			),
		).toMatchObject({ value: { recorded: 'new' } })
		expect(order).toEqual(['first', 'second'])
	})

	it('an answer that is refused -> no hook runs', () => {
		const { lotFolder } = createQuestionLot({ question: QUESTION })
		const recording = recordingHook()

		expect(
			thrownBy(() =>
				withAnswerHooks({
					hooks: [recording.hook],
					action: () => recordAnswer(answerParamsOf({ lotFolder, answer: 'maybe' })),
				}),
			),
		).toMatchObject({ name: STORE_REFUSAL })
		expect(recording.calls).toEqual([])
	})

	it('the function registerAnswerHook returns -> once called, the hook runs no more', () => {
		const { lotFolder } = createQuestionLot({ question: QUESTION })
		const recording = recordingHook()

		expect(
			outcomeOf(function registerRemoveAnswer() {
				registerAnswerHook({ hook: recording.hook })()
				return recordAnswer(answerParamsOf({ lotFolder }))
			}),
		).toMatchObject({ value: { recorded: 'new' } })
		expect(recording.calls).toEqual([])
	})

	it('a hook that throws -> the answer stays recorded and the hook error, not a store refusal, reaches the caller', () => {
		const { lotFolder } = createQuestionLot({ question: QUESTION })

		expect(
			thrownBy(() =>
				withAnswerHooks({
					hooks: [
						function failing() {
							throw new Error(HOOK_MESSAGE)
						},
					],
					action: () => recordAnswer(answerParamsOf({ lotFolder })),
				}),
			),
		).toMatchObject({ name: 'Error', message: HOOK_MESSAGE })
		expect(readAnswerFile({ lotFolder, number: 1 })).toEqual({
			question: 'q1',
			answer: 'keep',
			by: 'caller',
			at: QUESTION_NOW.toISOString(),
		})
	})

	it('two hooks, the first throws -> the second does not run (G4b), the answer stays recorded', () => {
		const { lotFolder } = createQuestionLot({ question: QUESTION })
		const after = recordingHook()

		expect(
			thrownBy(() =>
				withAnswerHooks({
					hooks: [
						function failing() {
							throw new Error(HOOK_MESSAGE)
						},
						after.hook,
					],
					action: () => recordAnswer(answerParamsOf({ lotFolder })),
				}),
			),
		).toMatchObject({ message: HOOK_MESSAGE })
		expect(after.calls).toEqual([])
		expect(readAnswerFile({ lotFolder, number: 1 })).toMatchObject({ answer: 'keep' })
	})

	it('a hook that threw, then the retry with the hook working -> already, and the hook runs for it', () => {
		const { lotFolder } = createQuestionLot({ question: QUESTION })
		let runs = 0

		expect(
			outcomeOf(() =>
				withAnswerHooks({
					hooks: [
						function failsOnce() {
							runs += 1
							if (runs === 1) throw new Error(HOOK_MESSAGE)
						},
					],
					action: () => {
						try {
							recordAnswer(answerParamsOf({ lotFolder }))
						} catch {
							// the caller saw the hook's error and retries
						}
						return recordAnswer(answerParamsOf({ lotFolder }))
					},
				}),
			),
		).toMatchObject({ value: { recorded: 'already' } })
		expect(runs).toBe(2)
	})
})
