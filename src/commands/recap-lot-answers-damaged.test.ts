/**
 * `lot recap` on a lot folder whose answer is missing its `answer` or its `by` (written by hand, G16 R4-6): the row
 * renders the missing value empty, never the word "undefined", and the recap still exits 0.
 */
import { outcomeOf } from '../../test/call-outcome.ts'
import { lotWithAnswers } from '../../test/lot-with-answers.ts'
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

const QUESTION = 'Keep the old name?'
const GOOD_AT = '2026-11-08T10:00:00.000Z'

type DamagedRow = {
	title: string
	/** The question transitions of the lot (none: the answer names a question no transition holds). */
	questions: Record<number, string>
	body: Record<string, unknown>
	/** The row the recap renders. */
	row: { decision: string; by: string; when: string }
}

const DAMAGED_ROWS: DamagedRow[] = [
	{
		title: 'no answer field',
		questions: { 1: QUESTION },
		body: { question: 'q1', by: 'caller', at: GOOD_AT },
		row: { decision: `q1 ${QUESTION} -> `, by: 'caller', when: '2026-11-08' },
	},
	{
		title: 'no by field',
		questions: { 1: QUESTION },
		body: { question: 'q1', answer: 'fix', at: GOOD_AT },
		row: { decision: `q1 ${QUESTION} -> fix`, by: '', when: '2026-11-08' },
	},
	{
		title: 'neither the answer nor by',
		questions: { 1: QUESTION },
		body: { question: 'q1', at: GOOD_AT },
		row: { decision: `q1 ${QUESTION} -> `, by: '', when: '2026-11-08' },
	},
	{
		title: 'no answer field, no transition naming the question',
		questions: {},
		body: { question: 'q1', by: 'caller', at: GOOD_AT },
		row: { decision: 'q1 -> ', by: 'caller', when: '2026-11-08' },
	},
]

/** The rows of the answers of the lot (`q<k> ...`), as the recap reads them. */
function answerRowsOf(lot: LotHandoverWorkspace): RecapRecords['decisions'] {
	const handover = readHandoverFolder(lot.lotFolder)
	if (typeof handover === 'string') throw new Error(handover)
	const records = readRecapRecords({ handover, cwd: lot.start.repository })
	if (typeof records === 'string') throw new Error(records)
	return records.decisions.filter((row) => /^q\d+ /.test(row.decision))
}

describe('lot recap: a damaged answer', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const damaged of DAMAGED_ROWS) {
		it(`${damaged.title} -> the row holds an empty value where it is missing`, () => {
			const lot = lotWithAnswers({
				questions: damaged.questions,
				answers: [{ file: 'q1.json', body: damaged.body }],
			})

			expect(outcomeOf(() => answerRowsOf(lot))).toEqual({ value: [damaged.row] })
		})

		it(`${damaged.title} -> lot recap exits 0 and prints no "undefined"`, () => {
			const lot = lotWithAnswers({
				questions: damaged.questions,
				answers: [{ file: 'q1.json', body: damaged.body }],
			})
			const result = runLot({ cwd: lot.start.repository, argv: ['recap', lot.lotName] })

			expect({
				exitCode: result.exitCode,
				mentionsUndefined: result.output.includes('undefined'),
			}).toEqual({
				exitCode: 0,
				mentionsUndefined: false,
			})
		})
	}
})
