/**
 * `raiseQuestion` (33S section 4, Questions are transitions): a question is a `question` transition whose id is
 * `q<k>`, `k` fixed by the transition number that wins (two raisers never share an id); a raise on a lot that
 * cannot take it is refused and writes nothing.
 */
import { outcomeOf } from '../../../test/call-outcome.ts'
import {
	HOSTILE_TEXT,
	QUESTION_DETAILS_LIMIT,
	QUESTION_LOT,
	QUESTION_NOW,
	QUESTION_TEXT,
	QUESTION_TEXT_LIMIT,
} from '../../../test/lot-questions.constants.ts'
import {
	createQuestionLot,
	questionWith,
	textOfLength,
	transitionFilesOf,
} from '../../../test/lot-questions.ts'
import { snapshotOf } from '../../../test/lot-start-workspace.ts'
import { transitionOf } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { thrownBy } from '../../../test/thrown-by.ts'
import { raiseQuestion } from './questions.ts'
import { STORE_REFUSAL } from './store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLotParams } from '../../../test/lot-questions.types.ts'
import type { RaiseQuestionParams } from './questions.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const RAISER = 'test-reviewer'

/** The fields of a plain caller question; a row overrides what it tests. */
function raiseOf(
	overrides: Partial<RaiseQuestionParams> & { lotFolder: string },
): RaiseQuestionParams {
	return {
		audience: 'caller',
		station: 'test-reviewer',
		text: QUESTION_TEXT,
		now: QUESTION_NOW,
		by: RAISER,
		...overrides,
	}
}

describe('raiseQuestion: the transition it publishes', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot with its start transition only -> q1, published as transition 2', () => {
		const { lotFolder } = createQuestionLot()

		expect(outcomeOf(() => raiseQuestion(raiseOf({ lotFolder })))).toEqual({
			value: { id: 'q1', seq: 2 },
		})
	})

	it('the first question -> transition 2 is a working question transition at the time given, by the raiser, at the station', () => {
		const { lotFolder } = createQuestionLot()
		outcomeOf(() => raiseQuestion(raiseOf({ lotFolder })))

		expect(transitionFilesOf(lotFolder).at(-1)).toMatchObject({
			seq: 2,
			at: QUESTION_NOW.toISOString(),
			lot: QUESTION_LOT,
			state: 'working',
			position: { station: 'test-reviewer' },
			cause: { kind: 'question', by: RAISER },
			simulated: false,
		})
	})

	it('text, audience and station only -> the question is { id, audience, station, text } and no other key', () => {
		const { lotFolder } = createQuestionLot()
		outcomeOf(() => raiseQuestion(raiseOf({ lotFolder })))

		expect(transitionFilesOf(lotFolder).at(-1)?.question).toEqual({
			id: 'q1',
			audience: 'caller',
			station: 'test-reviewer',
			text: QUESTION_TEXT,
		})
	})

	it('a person question with options, details and an ask -> all of them in the question', () => {
		const { lotFolder } = createQuestionLot()
		outcomeOf(() =>
			raiseQuestion(
				raiseOf({
					lotFolder,
					audience: 'person',
					station: 'ask',
					options: ['accept', 'fix'],
					details: 'Two lines of context\nwith a break.',
					ask: 'A-0007',
				}),
			),
		)

		expect(transitionFilesOf(lotFolder).at(-1)?.question).toEqual({
			id: 'q1',
			audience: 'person',
			station: 'ask',
			text: QUESTION_TEXT,
			options: ['accept', 'fix'],
			details: 'Two lines of context\nwith a break.',
			ask: 'A-0007',
		})
	})

	it('q1 already asked -> the next question is q2, published as transition 3', () => {
		const { lotFolder } = createQuestionLot({ question: questionWith() })

		expect(outcomeOf(() => raiseQuestion(raiseOf({ lotFolder })))).toEqual({
			value: { id: 'q2', seq: 3 },
		})
	})

	it('q1 asked and a station transition after it -> the next question is q2 at transition 4 (k counts question transitions, nothing else)', () => {
		const { lotFolder } = createQuestionLot({
			question: questionWith(),
			later: [transitionOf({ seq: 3, kind: 'station' })],
		})

		expect(outcomeOf(() => raiseQuestion(raiseOf({ lotFolder })))).toEqual({
			value: { id: 'q2', seq: 4 },
		})
	})

	it(`a text of ${QUESTION_TEXT_LIMIT} characters and details of ${QUESTION_DETAILS_LIMIT} -> raised`, () => {
		const { lotFolder } = createQuestionLot()

		expect(
			outcomeOf(() =>
				raiseQuestion(
					raiseOf({
						lotFolder,
						text: textOfLength(QUESTION_TEXT_LIMIT),
						details: textOfLength(QUESTION_DETAILS_LIMIT),
					}),
				),
			),
		).toEqual({ value: { id: 'q1', seq: 2 } })
	})

	it('a simulated lot whose last transition is at step 2 of 5, round 3 -> the question transition is simulated and repeats step, of and round, with the station replaced (G4b)', () => {
		const { lotFolder } = createQuestionLot({
			simulated: true,
			later: [
				{
					...transitionOf({ seq: 2, kind: 'station' }),
					position: { step: 2, of: 5, station: 'implementer', round: 3 },
				},
			],
		})
		outcomeOf(() => raiseQuestion(raiseOf({ lotFolder, station: 'test-reviewer' })))

		expect(transitionFilesOf(lotFolder).at(-1)).toMatchObject({
			seq: 3,
			simulated: true,
			position: { step: 2, of: 5, station: 'test-reviewer', round: 3 },
		})
	})

	it('a text with a terminal escape sequence and a right-to-left override -> stored as it is (case 40)', () => {
		const { lotFolder } = createQuestionLot()
		outcomeOf(() => raiseQuestion(raiseOf({ lotFolder, text: HOSTILE_TEXT })))

		expect(transitionFilesOf(lotFolder).at(-1)?.question?.text).toBe(HOSTILE_TEXT)
	})
})

describe(
	'raiseQuestion: two raisers for one transition number',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('another raiser publishes the number between the read and the publish -> q1 and q2 in order, never one id twice (B3)', () => {
			const { lotFolder } = createQuestionLot()
			const outer = outcomeOf(() =>
				raiseQuestion(
					raiseOf({
						lotFolder,
						text: 'outer',
						afterRead: function innerRaiser() {
							raiseQuestion(raiseOf({ lotFolder, text: 'inner', by: 'other-raiser' }))
						},
					}),
				),
			)

			expect(outer).toEqual({ value: { id: 'q2', seq: 3 } })
			expect(
				transitionFilesOf(lotFolder)
					.slice(1)
					.map((transition) => [
						transition.seq,
						transition.question?.id,
						transition.question?.text,
					]),
			).toEqual([
				[2, 'q1', 'inner'],
				[3, 'q2', 'outer'],
			])
		})
	},
)

type RefusalRow = {
	title: string
	lot?: QuestionLotParams
	overrides?: Partial<RaiseQuestionParams>
	/** A text the refusal holds. */
	mentions?: string
}

const REFUSAL_ROWS: RefusalRow[] = [
	{ title: 'an empty text', overrides: { text: '' } },
	{ title: 'a text of spaces only', overrides: { text: '   ' } },
	{ title: 'a text of two lines', overrides: { text: 'first line\nsecond line' } },
	{ title: 'a text of two lines (CRLF)', overrides: { text: 'first line\r\nsecond line' } },
	{ title: 'a text with a lone CR', overrides: { text: 'first line\rsecond line' } },
	{
		title: `a text of ${QUESTION_TEXT_LIMIT + 1} characters`,
		overrides: { text: textOfLength(QUESTION_TEXT_LIMIT + 1) },
	},
	{
		title: 'options with a duplicate',
		overrides: { options: ['accept', 'fix', 'accept'] },
	},
	{
		title: 'options with a duplicate once trimmed and case-folded',
		overrides: { options: ['accept', ' Accept '] },
	},
	{ title: 'an empty option', overrides: { options: ['accept', ''] } },
	{ title: 'an option of spaces only', overrides: { options: ['accept', '  '] } },
	{
		title: `details of ${QUESTION_DETAILS_LIMIT + 1} characters`,
		overrides: { details: textOfLength(QUESTION_DETAILS_LIMIT + 1) },
	},
	{
		title: 'a canceled lot (case 21)',
		lot: { later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })] },
		mentions: 'canceled',
	},
	{
		title: 'a failed lot (case 21)',
		lot: { later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })] },
		mentions: 'failed',
	},
	{
		title: 'a committed lot (case 21)',
		lot: { registry: 'committed' },
		mentions: 'committed',
	},
	{
		title: 'a registry entry pending that names the lot folder, a person question (case 55)',
		lot: { registry: 'pending' },
		overrides: { audience: 'person' },
		mentions: 'rehash it or stop the lot first',
	},
	{
		title: 'a registry entry pending that names the lot folder, a caller question',
		lot: { registry: 'pending' },
		mentions: 'rehash it or stop the lot first',
	},
]

describe('raiseQuestion: what it refuses', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of REFUSAL_ROWS)
		it(`${row.title} -> refused as a store refusal, the lot folder unchanged by bytes`, () => {
			const { lotFolder } = createQuestionLot(row.lot)
			const before = snapshotOf(lotFolder)

			expect(thrownBy(() => raiseQuestion(raiseOf({ lotFolder, ...row.overrides })))).toMatchObject(
				{
					name: STORE_REFUSAL,
					message: expect.stringContaining(row.mentions ?? ''),
				},
			)
			expect(snapshotOf(lotFolder)).toEqual(before)
		})
})
