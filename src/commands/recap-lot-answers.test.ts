/**
 * `lot recap <id|folder>` on a lot folder: after `decisions.md`'s own rows, one row per `answers/q<k>.json`, ordered
 * by `k` (33S section 4, Answers: the answers are never copied into `decisions.md`, the readers render them). The
 * decision cell is `q<k> <question text> -> <answer>` (`q<k> -> <answer>` when no transition names the question),
 * who is the answer's `by`, the date the day of its `at` in UTC. Recap writes nothing, twice gives one output.
 */
import {
	bytesOf,
	isolateStateFolder,
	startRealLot,
	writeLotHandover,
	writeTransition,
} from '../../test/lot-handover-workspace.ts'
import { recapFolderPath, recapSection, writeRecapFolder } from '../../test/mutation-hooks.ts'
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

const DECISIONS_TEXT =
	'# Decisions - lot\n\n| decision | by | when |\n|---|---|---|\n| Kept the plan order | user | 2026-11-07 |\n| Dropped the second step | user | 2026-11-07 |\n'

const FIRST_QUESTION = 'Keep the old subscriber name?'
const SECOND_QUESTION = 'Which scope does the lot take?'

/** The answers written by hand: q10 and q2 before q1, q10 with no question transition, the days around UTC midnight. */
const ANSWERS = [
	{ question: 'q10', answer: 'later', by: 'caller', at: '2026-11-09T09:00:00.000Z' },
	{ question: 'q2', answer: 'src only', by: 'a-person', at: '2026-11-09T00:30:00.000Z' },
	{ question: 'q1', answer: 'fix', by: 'caller', at: '2026-11-08T23:30:00.000Z' },
]

/** What the answers become in `decisions.md`'s shape, in `k` order. */
const ANSWER_ROWS = [
	{ decision: `q1 ${FIRST_QUESTION} -> fix`, by: 'caller', when: '2026-11-08' },
	{ decision: `q2 ${SECOND_QUESTION} -> src only`, by: 'a-person', when: '2026-11-09' },
	{ decision: 'q10 -> later', by: 'caller', when: '2026-11-09' },
]

const FILE_ROWS = [
	{ decision: 'Kept the plan order', by: 'user', when: '2026-11-07' },
	{ decision: 'Dropped the second step', by: 'user', when: '2026-11-07' },
]

/** The decision lines the recap prints for `rows`, as the Decisions section writes them. */
function decisionLinesOf(rows: readonly { decision: string; by: string }[]): string[] {
	return rows.map((row) => `- ${row.decision} (by ${row.by})`)
}

/** A lot with its hand-over written into its folder, `decisions.md`, two questions asked and three answers, all by hand. */
function answeredLot(): LotHandoverWorkspace {
	isolateStateFolder()
	// the day of an answer is the UTC day whatever the zone the machine runs in: 00:30 UTC is still the day before in Los Angeles
	vi.stubEnv('TZ', 'America/Los_Angeles')
	const lot = startRealLot()
	writeLotHandover(lot)
	writeRecordFile({ folder: lot.lotFolder, name: 'decisions.md', text: DECISIONS_TEXT })
	writeTransition({
		lotFolder: lot.lotFolder,
		transition: transitionOf({
			seq: 20,
			kind: 'question',
			question: { ...questionOf(1), text: FIRST_QUESTION },
		}),
	})
	writeTransition({
		lotFolder: lot.lotFolder,
		transition: transitionOf({
			seq: 21,
			kind: 'question',
			question: { ...questionOf(2), text: SECOND_QUESTION },
		}),
	})
	for (const answer of ANSWERS)
		writeRecordFile({
			folder: lot.lotFolder,
			name: `answers/${answer.question}.json`,
			text: `${JSON.stringify(answer)}\n`,
		})
	return lot
}

/** `lot recap <argument>` from the lot's main checkout. */
function recapOf(params: { lot: LotHandoverWorkspace; argument: string }) {
	return runLot({ cwd: params.lot.start.repository, argv: ['recap', params.argument] })
}

/** The lines of a recap that render an answer (`- q<k> ...`). */
function answerLinesOf(output: string): string[] {
	return output.split('\n').filter((line) => /^- q\d+ /.test(line))
}

/** The decision rows of the records the recap reads, or the refusal as an error. */
function decisionRowsOf(records: RecapRecords | string): RecapRecords['decisions'] {
	if (typeof records === 'string') throw new Error(records)
	return records.decisions
}

describe('lot recap: the answers of a lot folder', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('decisions.md with two rows and answers q1, q2, q10 (q10 with no question) → the records hold the file rows, then q1, q2, q10 with who and the UTC day (E12)', () => {
		const lot = answeredLot()
		const handover = readHandoverFolder(lot.lotFolder)
		if (typeof handover === 'string') throw new Error(handover)

		expect(decisionRowsOf(readRecapRecords({ handover, cwd: lot.start.repository }))).toEqual([
			...FILE_ROWS,
			...ANSWER_ROWS,
		])
	})

	it('the same lot, by its full name and by its index → the Decisions section holds the file rows, then one line per answer in k order', () => {
		const lot = answeredLot()
		const expected = decisionLinesOf([...FILE_ROWS, ...ANSWER_ROWS])

		expect(
			[lot.lotName, lot.lotName.slice(0, 4), lot.lotFolder].map(function sectionOf(argument) {
				const recap = recapOf({ lot, argument })
				return {
					exitCode: recap.exitCode,
					decisions: recapSection({ output: recap.output, heading: '### Decisions' }),
				}
			}),
		).toEqual([
			{ exitCode: 0, decisions: expected },
			{ exitCode: 0, decisions: expected },
			{ exitCode: 0, decisions: expected },
		])
	})

	it('recap run twice (a crash between the answers and the rows costs nothing) → the same output, every answer exactly once, no byte of the folder, the registry or the locks changed (case 47)', () => {
		const lot = answeredLot()
		const before = bytesOf(lot)

		const first = recapOf({ lot, argument: lot.lotName })
		const second = recapOf({ lot, argument: lot.lotName })

		expect({
			sameOutput: second.output === first.output,
			answerLines: answerLinesOf(second.output),
			bytes: bytesOf(lot),
		}).toEqual({
			sameOutput: true,
			answerLines: decisionLinesOf(ANSWER_ROWS),
			bytes: before,
		})
	})

	it('answers/ files inside a hand-over folder that is no lot folder → rendered as today: the answers are not read there', () => {
		const lot = answeredLot()
		const plain = recapFolderPath()
		writeRecapFolder({ root: lot.start.repository, folder: plain })
		writeRecordFile({
			folder: plain,
			name: 'answers/q1.json',
			text: `${JSON.stringify(ANSWERS[2])}\n`,
		})

		const lotRecap = recapOf({ lot, argument: lot.lotName })
		const plainRecap = recapOf({ lot, argument: plain })

		expect({
			lot: recapSection({ output: lotRecap.output, heading: '### Decisions' }).length,
			plain: recapSection({ output: plainRecap.output, heading: '### Decisions' }),
		}).toEqual({
			lot: FILE_ROWS.length + ANSWER_ROWS.length,
			plain: ['No decision recorded.'],
		})
	})
})
