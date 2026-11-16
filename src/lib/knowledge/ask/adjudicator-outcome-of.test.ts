import { checkedReportOf } from '../../../../test/ask-check-report-helper.ts'
import {
	DOCUMENT_REPORT,
	QUOTE_SEVEN_WORDS_ABSENT,
	REPORT_FILE,
} from '../../../../test/ask-report-fixtures.constants.ts'
import { adjudicatorOutcomeOf } from './adjudicator-outcome-of.ts'

import { describe, expect, it } from 'vitest'

const PERSON = { state: 'needs-person', reason: expect.stringMatching(/\S/u) }

/** The baseline report with a second claim whose cite quotes words the range never holds (a refused cite). */
const REPORT_WITH_REFUSED_CITE = {
	...DOCUMENT_REPORT,
	claims: [
		...DOCUMENT_REPORT.claims,
		{
			text: 'D shall hold DD_1 elsewhere',
			supports: 'yes',
			cites: [{ file: REPORT_FILE, from: 12, to: 13, quote: QUOTE_SEVEN_WORDS_ABSENT }],
		},
	],
}

/** The baseline report whose only claim cites words the range never holds. */
const REPORT_WITH_ONLY_A_REFUSED_CITE = {
	...DOCUMENT_REPORT,
	claims: [
		{
			text: 'D shall hold DD_1',
			supports: 'yes',
			cites: [{ file: REPORT_FILE, from: 12, to: 13, quote: QUOTE_SEVEN_WORDS_ABSENT }],
		},
	],
}

describe('adjudicatorOutcomeOf: its report goes through the checks, then the person unless it holds (case 33)', () => {
	it('a report accepted with a verified claim -> answered with its verdict, answer and verified cite', () => {
		expect(
			adjudicatorOutcomeOf({ checked: checkedReportOf({ value: DOCUMENT_REPORT }) }),
		).toMatchObject({
			state: 'answered',
			agreed: {
				verdict: 'yes',
				value: null,
				answer: DOCUMENT_REPORT.answer,
				cites: DOCUMENT_REPORT.claims[0]?.cites,
			},
		})
	})

	it('a report refused by the checks (a cite its range does not hold) -> the person', () => {
		expect(
			adjudicatorOutcomeOf({
				checked: checkedReportOf({ value: REPORT_WITH_ONLY_A_REFUSED_CITE }),
			}),
		).toMatchObject(PERSON)
	})

	it('a report accepted by one verified claim but holding a refused cite -> the person: a refused cite is never kept', () => {
		expect(
			adjudicatorOutcomeOf({ checked: checkedReportOf({ value: REPORT_WITH_REFUSED_CITE }) }),
		).toMatchObject(PERSON)
	})

	it('a report not-in-text -> the person', () => {
		const value = { ...DOCUMENT_REPORT, verdict: 'not-in-text', claims: [] }

		expect(adjudicatorOutcomeOf({ checked: checkedReportOf({ value }) })).toMatchObject(PERSON)
	})

	it('a report refused by its schema -> the person', () => {
		expect(
			adjudicatorOutcomeOf({ checked: checkedReportOf({ value: { ask: 'A-0007' } }) }),
		).toMatchObject(PERSON)
	})
})
