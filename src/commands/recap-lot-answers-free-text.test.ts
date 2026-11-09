/**
 * `lot recap` on a lot folder whose answers hold free text: the rows hold the question and the answer as written
 * (no replacement pattern is read in them), and an answer whose `at` is no date renders with an empty date.
 */
import { outcomeOf } from '../../test/call-outcome.ts'
import {
	isolateStateFolder,
	startRealLot,
	writeLotHandover,
	writeTransition,
} from '../../test/lot-handover-workspace.ts'
import { questionOf, transitionOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readHandoverFolder } from '../lib/handover/read-handover-folder.ts'
import { readRecapRecords } from '../lib/recap/read-recap-records.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'
import type { RecapRecords } from '../lib/recap/recap.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const AWKWARD_QUESTION = "Keep {answer} and {text} and $' and $& of the name?"
const AWKWARD_ANSWER = 'keep $& and $$ costs'
const OTHER_QUESTION = 'Which scope does the lot take?'
const GOOD_AT = '2026-11-08T10:00:00.000Z'

/** A lot with its hand-over written, `questions` asked by transitions and `answers` written by hand as given. */
function lotWith(params: {
	questions: Record<number, string>
	answers: { file: string; body: Record<string, unknown> }[]
}): LotHandoverWorkspace {
	isolateStateFolder()
	const lot = startRealLot()
	writeLotHandover(lot)
	for (const [number, text] of Object.entries(params.questions))
		writeTransition({
			lotFolder: lot.lotFolder,
			transition: transitionOf({
				seq: 20 + Number(number),
				kind: 'question',
				question: { ...questionOf(Number(number)), text },
			}),
		})
	for (const answer of params.answers)
		writeRecordFile({
			folder: lot.lotFolder,
			name: `answers/${answer.file}`,
			text: `${JSON.stringify(answer.body)}\n`,
		})
	return lot
}

/** The decision rows of the records the recap reads, or the refusal as an error. */
function decisionRowsOf(records: RecapRecords | string): RecapRecords['decisions'] {
	if (typeof records === 'string') throw new Error(records)
	return records.decisions
}

/** The rows of the answers of the lot (`q<k> ...`), read as the recap reads them. */
function answerRowsOf(lot: LotHandoverWorkspace): RecapRecords['decisions'] {
	const handover = readHandoverFolder(lot.lotFolder)
	if (typeof handover === 'string') throw new Error(handover)
	return decisionRowsOf(readRecapRecords({ handover, cwd: lot.start.repository })).filter((row) =>
		/^q\d+ /.test(row.decision),
	)
}

describe('lot recap: free text in an answer row', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("an answer holding $& and $$, a question text holding {answer}, {text} and $' -> the row is the question text as written, then the answer as written", () => {
		const lot = lotWith({
			questions: { 1: AWKWARD_QUESTION },
			answers: [
				{
					file: 'q1.json',
					body: { question: 'q1', answer: AWKWARD_ANSWER, by: 'caller', at: GOOD_AT },
				},
			],
		})

		expect(answerRowsOf(lot)).toEqual([
			{ decision: `q1 ${AWKWARD_QUESTION} -> ${AWKWARD_ANSWER}`, by: 'caller', when: '2026-11-08' },
		])
	})
})

describe('lot recap: an answer whose at is no date', { timeout: STORE_CASE_TIMEOUT }, () => {
	const DAMAGED = [
		{ title: 'missing', body: { question: 'q1', answer: 'fix', by: 'caller' } },
		{
			title: 'not a date',
			body: { question: 'q1', answer: 'fix', by: 'caller', at: 'last tuesday' },
		},
	]

	for (const damaged of DAMAGED) {
		it(`at ${damaged.title} -> the answer renders with an empty date, the other answer renders normally`, () => {
			const lot = lotWith({
				questions: { 1: 'Keep the old name?', 2: OTHER_QUESTION },
				answers: [
					{ file: 'q1.json', body: damaged.body },
					{
						file: 'q2.json',
						body: { question: 'q2', answer: 'src only', by: 'a-person', at: GOOD_AT },
					},
				],
			})

			expect(outcomeOf(() => answerRowsOf(lot))).toEqual({
				value: [
					{ decision: 'q1 Keep the old name? -> fix', by: 'caller', when: '' },
					{ decision: `q2 ${OTHER_QUESTION} -> src only`, by: 'a-person', when: '2026-11-08' },
				],
			})
		})

		it(`at ${damaged.title} -> lot recap exits 0 and prints both answers`, () => {
			const lot = lotWith({
				questions: { 1: 'Keep the old name?', 2: OTHER_QUESTION },
				answers: [
					{ file: 'q1.json', body: damaged.body },
					{
						file: 'q2.json',
						body: { question: 'q2', answer: 'src only', by: 'a-person', at: GOOD_AT },
					},
				],
			})

			expect(runLot({ cwd: lot.start.repository, argv: ['recap', lot.lotName] })).toMatchObject({
				exitCode: 0,
				output: expect.stringContaining(`- q2 ${OTHER_QUESTION} -> src only (by a-person)`),
			})
		})
	}
})
