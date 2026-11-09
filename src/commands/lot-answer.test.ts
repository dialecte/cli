/**
 * `dialecte lot answer <id> <question> "<answer>" [--by <who>] [--json]` through `runLot` (33S section 4 Answers
 * and section 7): exit 0 with the status after the answer and `recorded: "new" | "already"`, exit 2 for each
 * refusal (JSON `{ error, next: null }`), an index held by two stores refused, a throwing hook exit 1.
 */
import { realpathSync } from 'node:fs'

import { withAnswerHooks } from '../../test/answer-hook-scope.ts'
import { outcomeOf } from '../../test/call-outcome.ts'
import {
	ANSWER_LIMIT,
	HOOK_MESSAGE,
	KEEP_OR_REPLACE,
	PERSON_ACCEPT_OR_FIX,
	QUESTION_LOT,
	QUESTION_NOW,
} from '../../test/lot-questions.constants.ts'
import {
	createQuestionLot,
	holdingAll,
	questionWith,
	readAnswerFile,
	recordedOf,
	textOfLength,
	writeAnswerFile,
} from '../../test/lot-questions.ts'
import { snapshotOf, withJson, withLines } from '../../test/lot-start-workspace.ts'
import { createWorkspaceWithLots, writeStoreListFile } from '../../test/lot-stores.ts'
import { RECORD_TIME } from '../../test/store-records.constants.ts'
import { transitionOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLot, QuestionLotParams } from '../../test/lot-questions.types.ts'
import type { AnswerRecord, QuestionRecord } from '../lib/store/store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const WAIT_LINE = `dialecte lot wait ${QUESTION_LOT}`

/** `lot answer` from the lot's repository; `words` are everything after the verb. */
function answerWith(params: { lot: QuestionLot; words: string[] }) {
	return runLot({
		cwd: params.lot.workspace.repository,
		argv: ['answer', ...params.words],
		now: QUESTION_NOW,
	})
}

type SuccessRow = {
	title: string
	question: QuestionRecord
	words: string[]
	simulated?: boolean
	/** What the answer file holds. */
	record: { answer: string; by: string }
	/** The JSON fields of the status after the answer. */
	json: Record<string, unknown>
}

const SUCCESS_ROWS: SuccessRow[] = [
	{
		title: 'a caller question, the full name, no --by',
		question: questionWith(),
		words: [QUESTION_LOT, 'q1', 'keep'],
		record: { answer: 'keep', by: 'caller' },
		json: { recorded: 'new', state: 'working', answered: 1, questions: [], next: WAIT_LINE },
	},
	{
		title: 'the index 0007',
		question: questionWith(),
		words: ['0007', 'q1', 'keep'],
		record: { answer: 'keep', by: 'caller' },
		json: { lot: QUESTION_LOT, recorded: 'new', next: WAIT_LINE },
	},
	{
		title: 'the index 7',
		question: questionWith(),
		words: ['7', 'q1', 'keep'],
		record: { answer: 'keep', by: 'caller' },
		json: { lot: QUESTION_LOT, recorded: 'new', next: WAIT_LINE },
	},
	{
		title: 'a person question with --by a-person',
		question: PERSON_ACCEPT_OR_FIX,
		words: [QUESTION_LOT, 'q1', 'accept', '--by', 'a-person'],
		record: { answer: 'accept', by: 'a-person' },
		json: { recorded: 'new', state: 'working', answered: 1, next: WAIT_LINE },
	},
	{
		title: 'a caller question with --by host-agent',
		question: questionWith(),
		words: [QUESTION_LOT, 'q1', 'keep', '--by', 'host-agent'],
		record: { answer: 'keep', by: 'host-agent' },
		json: { recorded: 'new', next: WAIT_LINE },
	},
	{
		title: 'options and the answer `Fix ` -> the option fix is recorded',
		question: PERSON_ACCEPT_OR_FIX,
		words: [QUESTION_LOT, 'q1', 'Fix ', '--by', 'a-person'],
		record: { answer: 'fix', by: 'a-person' },
		json: { recorded: 'new', next: WAIT_LINE },
	},
	{
		title: 'a simulated lot -> the wait line carries --timeout 60',
		question: questionWith(),
		words: [QUESTION_LOT, 'q1', 'keep'],
		simulated: true,
		record: { answer: 'keep', by: 'caller' },
		json: {
			recorded: 'new',
			simulated: true,
			next: `${WAIT_LINE} --timeout 60`,
		},
	},
	{
		title: `an answer of ${ANSWER_LIMIT} characters`,
		question: questionWith(),
		words: [QUESTION_LOT, 'q1', textOfLength(ANSWER_LIMIT)],
		record: { answer: textOfLength(ANSWER_LIMIT), by: 'caller' },
		json: { recorded: 'new' },
	},
]

describe('lot answer --json: a new answer', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of SUCCESS_ROWS)
		it(`${row.title} -> exit 0, the status after the answer with recorded new, the answer file published`, () => {
			const lot = createQuestionLot({ question: row.question, simulated: row.simulated })

			expect(withJson(answerWith({ lot, words: [...row.words, '--json'] }))).toMatchObject({
				exitCode: 0,
				json: row.json,
			})
			expect(readAnswerFile({ lotFolder: lot.lotFolder, number: 1 })).toEqual({
				question: 'q1',
				...row.record,
				at: QUESTION_NOW.toISOString(),
			})
		})
})

describe('lot answer: the same answer again', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an answer recorded already, the same again -> exit 0, recorded already, nothing written', () => {
		const lot = createQuestionLot({ question: KEEP_OR_REPLACE })
		writeAnswerFile({ lotFolder: lot.lotFolder, record: recordedOf() })
		const before = snapshotOf(lot.lotFolder)

		expect(
			withJson(answerWith({ lot, words: [QUESTION_LOT, 'q1', 'keep', '--json'] })),
		).toMatchObject({
			exitCode: 0,
			json: { recorded: 'already', answered: 1, next: WAIT_LINE },
		})
		expect(snapshotOf(lot.lotFolder)).toEqual(before)
	})

	it('`Fix ` recorded as fix, a retry of `fix` (case 36) -> recorded already', () => {
		const lot = createQuestionLot({ question: PERSON_ACCEPT_OR_FIX })
		const words = [QUESTION_LOT, 'q1', '--by', 'a-person', '--json']
		answerWith({ lot, words: [words[0], words[1], 'Fix ', ...words.slice(2)] })

		expect(
			withJson(answerWith({ lot, words: [words[0], words[1], 'fix', ...words.slice(2)] })),
		).toMatchObject({ exitCode: 0, json: { recorded: 'already' } })
	})
})

describe('lot answer: the text form', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a caller question answered -> exit 0 and a next: line naming lot wait', () => {
		const lot = createQuestionLot({ question: questionWith() })

		expect(withLines(answerWith({ lot, words: [QUESTION_LOT, 'q1', 'keep'] }))).toMatchObject({
			exitCode: 0,
			lines: expect.arrayContaining([`next: ${WAIT_LINE}`]),
		})
	})
})

type RefusalRow = {
	title: string
	question?: QuestionRecord
	lot?: QuestionLotParams
	recorded?: AnswerRecord
	words: string[]
	/** The texts the error holds. */
	mentions: string[]
}

const REFUSAL_ROWS: RefusalRow[] = [
	{
		title: 'a person question and no --by (case 37)',
		question: PERSON_ACCEPT_OR_FIX,
		words: [QUESTION_LOT, 'q1', 'accept'],
		mentions: ['--by'],
	},
	{
		title: 'a person question and --by caller (case 37)',
		question: PERSON_ACCEPT_OR_FIX,
		words: [QUESTION_LOT, 'q1', 'accept', '--by', 'caller'],
		mentions: ['--by'],
	},
	{
		title: 'an answer that is none of the options (case 36)',
		question: KEEP_OR_REPLACE,
		words: [QUESTION_LOT, 'q1', 'maybe'],
		mentions: ['keep', 'replace'],
	},
	{
		title: 'another answer than the recorded one (case 34)',
		question: KEEP_OR_REPLACE,
		recorded: recordedOf(),
		words: [QUESTION_LOT, 'q1', 'replace'],
		mentions: ['keep', 'caller', RECORD_TIME],
	},
	{
		title: 'the same answer with another --by',
		recorded: recordedOf({ by: 'host-agent' }),
		words: [QUESTION_LOT, 'q1', 'keep', '--by', 'other-host'],
		mentions: ['keep', 'host-agent', RECORD_TIME],
	},
	{ title: 'an unknown question', words: [QUESTION_LOT, 'q7', 'keep'], mentions: ['q7'] },
	{ title: 'an empty answer', words: [QUESTION_LOT, 'q1', ''], mentions: [] },
	{ title: 'an answer of two lines', words: [QUESTION_LOT, 'q1', 'keep\nit'], mentions: [] },
	{ title: 'an answer with a lone CR', words: [QUESTION_LOT, 'q1', 'keep\rit'], mentions: [] },
	{
		title: `an answer of ${ANSWER_LIMIT + 1} characters`,
		words: [QUESTION_LOT, 'q1', textOfLength(ANSWER_LIMIT + 1)],
		mentions: [],
	},
	{
		title: 'a committed lot',
		lot: { registry: 'committed' },
		words: [QUESTION_LOT, 'q1', 'keep'],
		mentions: ['committed'],
	},
	{
		title: 'a canceled lot',
		lot: { later: [transitionOf({ seq: 3, state: 'canceled', kind: 'stop' })] },
		words: [QUESTION_LOT, 'q1', 'keep'],
		mentions: ['canceled'],
	},
	{
		title: 'a failed lot',
		lot: { later: [transitionOf({ seq: 3, state: 'failed', kind: 'fail' })] },
		words: [QUESTION_LOT, 'q1', 'keep'],
		mentions: ['failed'],
	},
	{ title: 'an unknown lot', words: ['9999', 'q1', 'keep'], mentions: ['no lot', '9999'] },
]

describe('lot answer --json: what it refuses', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of REFUSAL_ROWS)
		it(`${row.title} -> exit 2, { error, next: null }, the lot folder unchanged by bytes`, () => {
			const lot = createQuestionLot({ question: row.question ?? questionWith(), ...row.lot })
			if (row.recorded) writeAnswerFile({ lotFolder: lot.lotFolder, record: row.recorded })
			const before = snapshotOf(lot.lotFolder)

			expect(withJson(answerWith({ lot, words: [...row.words, '--json'] }))).toMatchObject({
				exitCode: 2,
				json: { error: expect.stringMatching(holdingAll(row.mentions)), next: null },
			})
			expect(snapshotOf(lot.lotFolder)).toEqual(before)
		})

	it('another answer than the recorded one, in the text form -> exit 2 and the message names the recorded answer, its by and its time', () => {
		const lot = createQuestionLot({ question: KEEP_OR_REPLACE })
		writeAnswerFile({ lotFolder: lot.lotFolder, record: recordedOf() })

		expect(answerWith({ lot, words: [QUESTION_LOT, 'q1', 'replace'] })).toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(holdingAll(['keep', 'caller', RECORD_TIME])),
		})
	})
})

const USAGE_ROWS: { title: string; words: string[] }[] = [
	{ title: 'no words', words: [] },
	{ title: 'the id only', words: [QUESTION_LOT] },
	{ title: 'the id and the question, no answer', words: [QUESTION_LOT, 'q1'] },
	{ title: 'a word after the answer', words: [QUESTION_LOT, 'q1', 'keep', 'extra'] },
]

describe('lot answer --json: a wrong number of words', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of USAGE_ROWS)
		it(`${row.title} -> exit 2 with next: null, nothing written`, () => {
			const lot = createQuestionLot({ question: questionWith() })
			const before = snapshotOf(lot.lotFolder)

			expect(withJson(answerWith({ lot, words: [...row.words, '--json'] }))).toMatchObject({
				exitCode: 2,
				json: { error: expect.stringMatching(/answer/), next: null },
			})
			expect(snapshotOf(lot.lotFolder)).toEqual(before)
		})

	it('--by with no value -> exit 2 with next: null, nothing written', () => {
		const lot = createQuestionLot({ question: PERSON_ACCEPT_OR_FIX })
		const before = snapshotOf(lot.lotFolder)

		expect(
			withJson(answerWith({ lot, words: [QUESTION_LOT, 'q1', 'accept', '--json', '--by'] })),
		).toMatchObject({ exitCode: 2, json: { error: expect.any(String), next: null } })
		expect(snapshotOf(lot.lotFolder)).toEqual(before)
	})
})

/** Two workspaces whose stores both hold a lot of index 0005, each asking q1; the store list names both. */
function twoStoresWithTheSameIndex() {
	const first = createWorkspaceWithLots({ names: ['0005-repo-b'] })
	const second = createWorkspaceWithLots({ names: ['0005-repo-c'] })
	writeStoreListFile({
		stores: [first, second].map((each) => realpathSync(each.workspace.store)),
	})
	const lots = [first, second].map((each) => ({
		workspace: each.workspace,
		lotFolder: Object.values(each.folders)[0],
	}))
	for (const lot of lots)
		writeRecordFile({
			folder: lot.lotFolder,
			name: 'transitions/000002.json',
			text: `${JSON.stringify(transitionOf({ seq: 2, kind: 'question', question: questionWith() }))}\n`,
		})
	return { first: lots[0], second: lots[1] }
}

describe(
	'lot answer: an index that two stores hold (case 51)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the index 0005 from the repository of one of them -> exit 2 listing both full names, no answer written in either', () => {
			const { first, second } = twoStoresWithTheSameIndex()

			expect(
				withJson(answerWith({ lot: first, words: ['0005', 'q1', 'keep', '--json'] })),
			).toMatchObject({
				exitCode: 2,
				json: {
					error: expect.stringMatching(holdingAll(['0005-repo-b', '0005-repo-c'])),
					next: null,
				},
			})
			expect([
				readAnswerFile({ lotFolder: first.lotFolder, number: 1 }),
				readAnswerFile({ lotFolder: second.lotFolder, number: 1 }),
			]).toEqual([undefined, undefined])
		})

		it('the full name 0005-repo-c from the other repository -> exit 0, recorded in that lot (a full name is never ambiguous)', () => {
			const { first, second } = twoStoresWithTheSameIndex()

			expect(
				withJson(answerWith({ lot: first, words: ['0005-repo-c', 'q1', 'keep', '--json'] })),
			).toMatchObject({ exitCode: 0, json: { lot: '0005-repo-c', recorded: 'new' } })
			expect(readAnswerFile({ lotFolder: second.lotFolder, number: 1 })).toMatchObject({
				answer: 'keep',
			})
		})
	},
)

describe('lot answer: a hook that throws', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the answer recorded, the hook throws -> exit 1 with the hook message, the answer stays recorded', () => {
		const lot = createQuestionLot({ question: questionWith() })

		expect(
			outcomeOf(() =>
				withAnswerHooks({
					hooks: [
						function failing() {
							throw new Error(HOOK_MESSAGE)
						},
					],
					action: () => answerWith({ lot, words: [QUESTION_LOT, 'q1', 'keep'] }),
				}),
			),
		).toMatchObject({ value: { exitCode: 1, output: expect.stringContaining(HOOK_MESSAGE) } })
		expect(readAnswerFile({ lotFolder: lot.lotFolder, number: 1 })).toMatchObject({
			answer: 'keep',
		})
	})

	it('the same, under --json -> exit 1 with { error holding the hook message, next: null }, the answer stays recorded', () => {
		const lot = createQuestionLot({ question: questionWith() })

		expect(
			outcomeOf(() =>
				withAnswerHooks({
					hooks: [
						function failing() {
							throw new Error(HOOK_MESSAGE)
						},
					],
					action: () =>
						withJson(answerWith({ lot, words: [QUESTION_LOT, 'q1', 'keep', '--json'] })),
				}),
			),
		).toMatchObject({
			value: { exitCode: 1, json: { error: expect.stringContaining(HOOK_MESSAGE), next: null } },
		})
		expect(readAnswerFile({ lotFolder: lot.lotFolder, number: 1 })).toMatchObject({
			answer: 'keep',
		})
	})
})
