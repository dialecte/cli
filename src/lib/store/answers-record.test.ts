/**
 * `recordAnswer` (33S section 4, Answers: every row of the table): an answer is a read-only `answers/q<k>.json`
 * published once; the same answer again is `already`, any other is refused naming the recorded one; two answers at
 * once leave one recorded.
 */
import { outcomeOf } from '../../../test/call-outcome.ts'
import {
	ANSWER_LIMIT,
	KEEP_OR_REPLACE,
	LATER_NOW,
	PERSON_ACCEPT_OR_FIX,
	QUESTION_NOW,
} from '../../../test/lot-questions.constants.ts'
import {
	answerFileMode,
	answerParamsOf,
	createQuestionLot,
	holdingAll,
	questionWith,
	readAnswerFile,
	recordedOf,
	textOfLength,
	writeAnswerFile,
} from '../../../test/lot-questions.ts'
import { snapshotOf } from '../../../test/lot-start-workspace.ts'
import { RECORD_TIME } from '../../../test/store-records.constants.ts'
import { transitionOf } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { thrownBy } from '../../../test/thrown-by.ts'
import { recordAnswer } from './answers.ts'
import { STORE_REFUSAL } from './store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLotParams } from '../../../test/lot-questions.types.ts'
import type { RecordAnswerParams } from './answers.types.ts'
import type { AnswerRecord, QuestionRecord } from './store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type NewRow = {
	title: string
	question: QuestionRecord
	overrides?: Partial<RecordAnswerParams>
	/** The record published. */
	expected: Partial<AnswerRecord>
}

const NEW_ROWS: NewRow[] = [
	{
		title: 'an open caller question, an answer and by caller',
		question: questionWith(),
		expected: { answer: 'keep', by: 'caller' },
	},
	{
		title: 'a caller question and no by -> by caller',
		question: questionWith(),
		overrides: { by: undefined },
		expected: { answer: 'keep', by: 'caller' },
	},
	{
		title: 'a caller question answered by a named host',
		question: questionWith(),
		overrides: { by: 'host-agent' },
		expected: { answer: 'keep', by: 'host-agent' },
	},
	{
		title: 'a person question answered with a named by',
		question: PERSON_ACCEPT_OR_FIX,
		overrides: { answer: 'accept', by: 'a-person' },
		expected: { answer: 'accept', by: 'a-person' },
	},
	{
		title: 'options and the answer `Fix ` -> recorded as the option fix',
		question: PERSON_ACCEPT_OR_FIX,
		overrides: { answer: 'Fix ', by: 'a-person' },
		expected: { answer: 'fix', by: 'a-person' },
	},
	{
		title: 'options spelt `Accept` and `Fix`, the answer `fix` -> recorded as the option `Fix`',
		question: questionWith({ options: ['Accept', 'Fix'] }),
		overrides: { answer: 'fix' },
		expected: { answer: 'Fix', by: 'caller' },
	},
	{
		title: `an answer of ${ANSWER_LIMIT} characters`,
		question: questionWith(),
		overrides: { answer: textOfLength(ANSWER_LIMIT) },
		expected: { answer: textOfLength(ANSWER_LIMIT), by: 'caller' },
	},
]

describe('recordAnswer: a new answer', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of NEW_ROWS)
		it(`${row.title} -> new, answers/q1.json published read-only as { question, answer, by, at }`, () => {
			const { lotFolder } = createQuestionLot({ question: row.question })
			const record = { question: 'q1', at: QUESTION_NOW.toISOString(), ...row.expected }

			expect(
				outcomeOf(() => recordAnswer(answerParamsOf({ lotFolder, ...row.overrides }))),
			).toEqual({
				value: { recorded: 'new', answer: record },
			})
			expect(readAnswerFile({ lotFolder, number: 1 })).toEqual(record)
			expect(answerFileMode({ lotFolder, number: 1 })).toBe(0o444)
		})
})

type RetryRow = {
	title: string
	question: QuestionRecord
	recorded: AnswerRecord
	overrides?: Partial<RecordAnswerParams>
}

const RETRY_ROWS: RetryRow[] = [
	{
		title: 'the same answer and by again (case 35)',
		question: questionWith(),
		recorded: recordedOf(),
	},
	{
		title: 'the same answer, by left out of a caller question',
		question: questionWith(),
		recorded: recordedOf(),
		overrides: { by: undefined },
	},
	{
		title: 'the same answer a day later (the time recorded stays)',
		question: questionWith(),
		recorded: recordedOf(),
		overrides: { now: LATER_NOW },
	},
	{
		title: 'fix recorded, the retry `fix` (case 36)',
		question: PERSON_ACCEPT_OR_FIX,
		recorded: recordedOf({ answer: 'fix', by: 'a-person' }),
		overrides: { answer: 'fix', by: 'a-person' },
	},
	{
		title: 'fix recorded, the retry `Fix ` (compared after canonicalisation)',
		question: PERSON_ACCEPT_OR_FIX,
		recorded: recordedOf({ answer: 'fix', by: 'a-person' }),
		overrides: { answer: 'Fix ', by: 'a-person' },
	},
	{
		title: 'fix recorded, the retry ` FIX`',
		question: PERSON_ACCEPT_OR_FIX,
		recorded: recordedOf({ answer: 'fix', by: 'a-person' }),
		overrides: { answer: ' FIX', by: 'a-person' },
	},
]

describe('recordAnswer: the same answer again', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of RETRY_ROWS)
		it(`${row.title} -> already with the record as it was, nothing written`, () => {
			const { lotFolder } = createQuestionLot({ question: row.question })
			writeAnswerFile({ lotFolder, record: row.recorded })
			const before = snapshotOf(lotFolder)

			expect(
				outcomeOf(() => recordAnswer(answerParamsOf({ lotFolder, ...row.overrides }))),
			).toEqual({
				value: { recorded: 'already', answer: row.recorded },
			})
			expect(snapshotOf(lotFolder)).toEqual(before)
		})

	it('`Fix ` then `fix` (case 36) -> new, then already, the file holding fix', () => {
		const { lotFolder } = createQuestionLot({ question: PERSON_ACCEPT_OR_FIX })
		const by = 'a-person'

		expect([
			outcomeOf(() => recordAnswer(answerParamsOf({ lotFolder, answer: 'Fix ', by }))),
			outcomeOf(() =>
				recordAnswer(answerParamsOf({ lotFolder, answer: 'fix', by, now: LATER_NOW })),
			),
		]).toEqual([
			{
				value: {
					recorded: 'new',
					answer: { question: 'q1', answer: 'fix', by, at: QUESTION_NOW.toISOString() },
				},
			},
			{
				value: {
					recorded: 'already',
					answer: { question: 'q1', answer: 'fix', by, at: QUESTION_NOW.toISOString() },
				},
			},
		])
	})
})

type RefusalRow = {
	title: string
	question?: QuestionRecord
	lot?: QuestionLotParams
	recorded?: AnswerRecord
	overrides?: Partial<RecordAnswerParams>
	/** The texts the refusal holds. */
	mentions: string[]
}

const REFUSAL_ROWS: RefusalRow[] = [
	{
		title: 'another answer than the recorded one',
		recorded: recordedOf(),
		overrides: { answer: 'replace' },
		mentions: ['keep', 'caller', RECORD_TIME],
	},
	{
		title: 'the same answer with another by',
		recorded: recordedOf({ by: 'host-agent' }),
		overrides: { by: 'other-host' },
		mentions: ['keep', 'host-agent', RECORD_TIME],
	},
	{
		title: 'options and an answer that is none of them (`maybe`)',
		question: KEEP_OR_REPLACE,
		overrides: { answer: 'maybe' },
		mentions: ['keep', 'replace'],
	},
	{
		title: 'a person question and no by (case 37)',
		question: PERSON_ACCEPT_OR_FIX,
		overrides: { answer: 'accept', by: undefined },
		mentions: [],
	},
	{
		title: 'a person question and by caller (case 37)',
		question: PERSON_ACCEPT_OR_FIX,
		overrides: { answer: 'accept', by: 'caller' },
		mentions: [],
	},
	{ title: 'a question no transition names', overrides: { question: 'q9' }, mentions: ['q9'] },
	{
		title: 'something that is no question id',
		overrides: { question: 'banana' },
		mentions: ['banana'],
	},
	{ title: 'an empty answer', overrides: { answer: '' }, mentions: [] },
	{ title: 'an answer of spaces only', overrides: { answer: '   ' }, mentions: [] },
	{ title: 'an answer of two lines', overrides: { answer: 'keep\nreplace' }, mentions: [] },
	{ title: 'an answer with a lone CR', overrides: { answer: 'keep\rreplace' }, mentions: [] },
	{
		title: `an answer of ${ANSWER_LIMIT + 1} characters`,
		overrides: { answer: textOfLength(ANSWER_LIMIT + 1) },
		mentions: [],
	},
	{
		title: 'a canceled lot',
		lot: { later: [transitionOf({ seq: 3, state: 'canceled', kind: 'stop' })] },
		mentions: ['canceled'],
	},
	{
		title: 'a failed lot',
		lot: { later: [transitionOf({ seq: 3, state: 'failed', kind: 'fail' })] },
		mentions: ['failed'],
	},
	{ title: 'a committed lot', lot: { registry: 'committed' }, mentions: ['committed'] },
]

describe('recordAnswer: what it refuses', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of REFUSAL_ROWS)
		it(`${row.title} -> refused as a store refusal naming what it must, the lot folder unchanged by bytes`, () => {
			const { lotFolder } = createQuestionLot({
				question: row.question ?? questionWith(),
				...row.lot,
			})
			if (row.recorded) writeAnswerFile({ lotFolder, record: row.recorded })
			const before = snapshotOf(lotFolder)

			expect(
				thrownBy(() => recordAnswer(answerParamsOf({ lotFolder, ...row.overrides }))),
			).toMatchObject({
				name: STORE_REFUSAL,
				message: expect.stringMatching(holdingAll(row.mentions)),
			})
			expect(snapshotOf(lotFolder)).toEqual(before)
		})
})

describe('recordAnswer: two answers at once (case 34)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('another answer published between the temporary file and the publish -> the first published stays, the other is refused naming it', () => {
		const { lotFolder } = createQuestionLot({ question: KEEP_OR_REPLACE })

		expect(
			thrownBy(() =>
				recordAnswer(
					answerParamsOf({
						lotFolder,
						answer: 'keep',
						afterTemporaryWritten: function otherAnswer() {
							recordAnswer(
								answerParamsOf({ lotFolder, answer: 'replace', by: 'other-host', now: LATER_NOW }),
							)
						},
					}),
				),
			),
		).toMatchObject({
			name: STORE_REFUSAL,
			message: expect.stringMatching(holdingAll(['replace', 'other-host', '2026-11-08T13:30'])),
		})
		expect(readAnswerFile({ lotFolder, number: 1 })).toEqual({
			question: 'q1',
			answer: 'replace',
			by: 'other-host',
			at: LATER_NOW.toISOString(),
		})
	})

	it('the same answer published meanwhile (two retries) -> the loser reads it and answers already, the file the winner wrote', () => {
		const { lotFolder } = createQuestionLot({ question: KEEP_OR_REPLACE })
		const outcome = outcomeOf(() =>
			recordAnswer(
				answerParamsOf({
					lotFolder,
					afterTemporaryWritten: function otherAnswer() {
						recordAnswer(answerParamsOf({ lotFolder, now: LATER_NOW }))
					},
				}),
			),
		)

		expect(outcome).toEqual({
			value: {
				recorded: 'already',
				answer: { question: 'q1', answer: 'keep', by: 'caller', at: LATER_NOW.toISOString() },
			},
		})
	})
})
