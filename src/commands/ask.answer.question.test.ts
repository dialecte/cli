/**
 * Rung 6 in a store lot (behaviours 3 and 4, spec section 18 "Rev 5 rules"): the ask that reaches the person raises
 * one question for the lot, and `lot answer` on it records the person's fact through the registered answer hook; the
 * lot's standard note follows the asks' states.
 */
import { join } from 'node:path'

import {
	CUT_TEXT_FLOOR,
	LONG_QUESTION,
	LOT_ANSWER_TEXT,
	LOT_STANDARD_FILE,
	PERSON,
	QUESTION_TEXT_LIMIT,
} from '../../test/ask-answer-fixtures.constants.ts'
import {
	askedInLot,
	factIdsIn,
	factTextIfAny,
	packedOutsideInLot,
	personAnswered,
	pointProcessAt,
	raisedQuestionsOf,
	readAnswerRecord,
	readFactIfAny,
} from '../../test/ask-answer-fixtures.ts'
import { NEXT_ANSWER, SEMANTIC_QUESTION } from '../../test/ask-command-workspace.constants.ts'
import {
	askedWith,
	createDocumentsWorkspace,
	createHandoverFolder,
	namesIn,
	readJsonFile,
} from '../../test/ask-command-workspace.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { ANSWER_LONG_TEXT, VERDICT_STANDARDS } from '../../test/ask-verdict-fixtures.constants.ts'
import { outsideReportOf, reportFilesOf, verdictedWith } from '../../test/ask-verdict-fixtures.ts'
import { LOT_NAME } from '../../test/lot-stores.constants.ts'
import { STANDARD_DISK_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { lotAnswer } from './lot-answer.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Whether `text` is `full` cut before a space, within the limit and not cut short. */
function isCutAtWord(full: string): (text: string | undefined) => boolean {
	return function cutAtWord(text: string | undefined): boolean {
		return (
			text !== undefined &&
			text.length <= QUESTION_TEXT_LIMIT &&
			text.length >= CUT_TEXT_FLOOR &&
			full.startsWith(text) &&
			full.at(text.length) === ' ' &&
			!text.endsWith(' ')
		)
	}
}

describe('an ask that reaches the person in a store lot raises one question for the lot (behaviour 3)', () => {
	it(
		'an ask sent to the person with --person-only -> exit 1 and one question: audience person, the ask set, the ask id and the question as its text',
		async () => {
			const asked = await askedInLot({ documents: false, argv: ['--person-only'], exitCode: 1 })

			expect(raisedQuestionsOf({ lotFolder: asked.lotFolder })).toEqual([
				{
					id: 'q1',
					audience: 'person',
					station: expect.any(String),
					text: `${asked.ask}: ${SEMANTIC_QUESTION}`,
					ask: asked.ask,
				},
			])
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'a question of more than 500 characters -> the text is cut before a space within 500 characters',
		async () => {
			const asked = await askedInLot({
				documents: false,
				question: LONG_QUESTION,
				argv: ['--person-only'],
				exitCode: 1,
			})

			expect(
				isCutAtWord(`${asked.ask}: ${LONG_QUESTION}`)(
					raisedQuestionsOf({ lotFolder: asked.lotFolder })[0]?.text,
				),
			).toBe(true)
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'a question of more than 500 characters -> the full text, the ask id included, is the question details',
		async () => {
			const asked = await askedInLot({
				documents: false,
				question: LONG_QUESTION,
				argv: ['--person-only'],
				exitCode: 1,
			})

			expect(raisedQuestionsOf({ lotFolder: asked.lotFolder })[0]?.details).toBe(
				`${asked.ask}: ${LONG_QUESTION}`,
			)
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'outside readers that do not agree (ask verdict) -> exit 1 and one question for the ask',
		async () => {
			const packed = await packedOutsideInLot()
			const reports = [
				outsideReportOf({ packed, letter: 'A', answer: ANSWER_LONG_TEXT }),
				outsideReportOf({ packed, letter: 'B', verdict: 'not-known' }),
			]

			await verdictedWith({ packed, files: reportFilesOf({ packed, reports }), exitCode: 1 })

			expect(raisedQuestionsOf({ lotFolder: packed.lotFolder })).toEqual([
				expect.objectContaining({ id: 'q1', audience: 'person', ask: packed.ask }),
			])
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('lot answer on the raised question records the person fact through the registered hook (behaviour 4)', () => {
	it(
		'lot answer <lot> q1 "<text>" --by person-a -> exit 0, a person fact by the person (unchecked: the ask went outside), the ask answered',
		async () => {
			const asked = await askedInLot({ documents: false, argv: ['--person-only'], exitCode: 1 })
			pointProcessAt({ workspace: asked.workspace })

			const result = lotAnswer({
				cwd: asked.lots.repository,
				argv: [LOT_NAME, 'q1', LOT_ANSWER_TEXT, '--by', PERSON],
			})

			expect({
				exitCode: result.exitCode,
				fact: readFactIfAny({
					folder: workspaceFactsFolder({ workspace: asked.workspace }),
					id: 'F-0001',
				}),
				record: readAnswerRecord({ asked }),
			}).toMatchObject({
				exitCode: 0,
				fact: {
					source: 'person',
					unchecked: true,
					answer: { text: LOT_ANSWER_TEXT },
					by: { person: PERSON },
				},
				record: { ask: asked.ask, by: PERSON, text: LOT_ANSWER_TEXT, fact: 'F-0001' },
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'the same lot answer again (a retry: the hook runs again on the recorded answer) -> nothing new: one fact, the fact file and answer.json as they were',
		async () => {
			const asked = await askedInLot({ documents: false, argv: ['--person-only'], exitCode: 1 })
			pointProcessAt({ workspace: asked.workspace })
			function answerAgain(): ReturnType<typeof lotAnswer> {
				return lotAnswer({
					cwd: asked.lots.repository,
					argv: [LOT_NAME, 'q1', LOT_ANSWER_TEXT, '--by', PERSON],
				})
			}
			answerAgain()
			const folder = workspaceFactsFolder({ workspace: asked.workspace })
			const factBefore = factTextIfAny({ folder, id: 'F-0001' })
			const recordBefore = JSON.stringify(readAnswerRecord({ asked }))

			const retry = answerAgain()

			expect({
				exitCode: retry.exitCode,
				facts: factIdsIn({ folder }),
				fact: factTextIfAny({ folder, id: 'F-0001' }),
				record: JSON.stringify(readAnswerRecord({ asked })),
			}).toEqual({ exitCode: 0, facts: ['F-0001'], fact: factBefore, record: recordBefore })
		},
		STORE_CASE_TIMEOUT,
	)
})

describe("the lot's standard note follows the asks' states after a verdict and an answer (spec section 18)", () => {
	it(
		'outside readers that agree (ask verdict in the lot) -> standard.json: state outside, the ask answered with its fact, the answers unchecked',
		async () => {
			const packed = await packedOutsideInLot()
			const reports = [
				outsideReportOf({ packed, letter: 'A', answer: ANSWER_LONG_TEXT }),
				outsideReportOf({ packed, letter: 'B' }),
			]

			await verdictedWith({ packed, files: reportFilesOf({ packed, reports }), exitCode: 0 })

			expect(readJsonFile(join(packed.lotFolder, LOT_STANDARD_FILE))).toMatchObject({
				state: 'outside',
				note: 'asks A-0001 answered F-0001 (all unchecked)',
				confirmed: false,
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'a person answers the outside ask (ask answer --lot) -> standard.json: state outside, the note ends (all confirmed)',
		async () => {
			const asked = await askedInLot({ documents: false, exitCode: 3 })
			await personAnswered({ asked, exitCode: 0 })

			expect(readJsonFile(join(asked.lotFolder, LOT_STANDARD_FILE))).toMatchObject({
				state: 'outside',
				note: 'asks A-0001 answered F-0001 (all confirmed)',
				confirmed: true,
			})
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('an ask that reaches the person in a hand-over folder raises no question', () => {
	it(
		'--person-only with --lot <hand-over folder> -> exit 1, the ask answer command printed, and the folder holds only the asks: no question or transition was written',
		async () => {
			const workspace = createDocumentsWorkspace({ standards: VERDICT_STANDARDS })
			const handover = createHandoverFolder({ workspace })

			const answer = await askedWith({
				workspace,
				argv: [SEMANTIC_QUESTION, '--person-only', '--lot', handover],
				exitCode: 1,
			})

			expect({ output: answer.output, folder: namesIn(handover) }).toEqual({
				output: expect.stringContaining(NEXT_ANSWER),
				folder: ['asks'],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
