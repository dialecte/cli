/**
 * Review round 1, R1-12: the exception cues of comparison 3 are forgiven only to a `depends` report that gives its
 * condition (a non-empty value); a `depends` report with none is judged like any other.
 */
import { checkedReportOf } from '../../../../test/ask-check-report-helper.ts'
import {
	DOCUMENT_REPORT,
	QUOTE_D_UNLESS,
	REPORT_FILE,
} from '../../../../test/ask-report-fixtures.constants.ts'
import { citeContextOf, proseLineOf } from '../../../../test/ask-report-fixtures.ts'

import { describe, expect, it } from 'vitest'

const UNLESS_CITES = citeContextOf({
	lines: [proseLineOf({ text: `in this clause ${QUOTE_D_UNLESS} and more` })],
})

/** A depends report whose one claim quotes an exception, with the value given. */
function dependsReportWith(params: { value: string | null }): Record<string, unknown> {
	return {
		...DOCUMENT_REPORT,
		verdict: 'depends',
		value: params.value,
		claims: [
			{
				text: 'D shall hold DD_1',
				supports: 'depends',
				cites: [{ file: REPORT_FILE, from: 12, to: 13, quote: QUOTE_D_UNLESS }],
			},
		],
	}
}

describe('checkReport: a depends report without its condition is not forgiven an exception cue', () => {
	const rows: Record<string, { value: string | null }> = {
		'a depends report with no value, its quote holding unless near the subject -> a polarity conflict':
			{
				value: null,
			},
		'a depends report with an empty value, its quote holding unless near the subject -> a polarity conflict':
			{ value: '' },
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(
				checkedReportOf({ value: dependsReportWith({ value: row.value }), cites: UNLESS_CITES }),
			).toMatchObject({ accepted: true, claims: [{ polarityConflict: true }] })
		})
})
