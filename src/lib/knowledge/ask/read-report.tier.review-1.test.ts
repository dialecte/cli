/**
 * Review round 1, R1-19: a report may carry the optional field `tier` (the tier of the model the reader ran on): one
 * of the tier names, refused otherwise; the schema stays 1 and a report without it reads as before.
 */
import { DOCUMENT_REPORT, OUTSIDE_REPORT } from '../../../../test/ask-report-fixtures.constants.ts'
import {
	TIER_FAST,
	TIER_STRONG,
	TIER_UNKNOWN,
} from '../../../../test/ask-review-1-fixtures.constants.ts'
import { readDocumentReport } from './read-document-report.ts'
import { readOutsideReport } from './read-outside-report.ts'

import { describe, expect, it } from 'vitest'

const READERS = {
	'a document': { read: readDocumentReport, report: DOCUMENT_REPORT },
	'an outside': { read: readOutsideReport, report: OUTSIDE_REPORT },
}

describe('reading a report: the tier field', () => {
	for (const [kind, reader] of Object.entries(READERS)) {
		it(`${kind} report with a tier name -> read, the tier kept`, () => {
			const value = { ...reader.report, tier: TIER_STRONG }

			expect(reader.read({ value })).toEqual({ report: value })
		})

		it(`${kind} report with another tier name -> read, the tier of that name kept`, () => {
			const value = { ...reader.report, tier: TIER_FAST }

			expect(reader.read({ value })).toEqual({ report: value })
		})

		it(`${kind} report with a tier that is not a tier name -> refused schema, a fault naming tier`, () => {
			expect(reader.read({ value: { ...reader.report, tier: TIER_UNKNOWN } })).toMatchObject({
				refused: 'schema',
				faults: [expect.stringContaining('tier')],
			})
		})

		it(`${kind} report whose tier is not text -> refused schema, a fault naming tier`, () => {
			expect(reader.read({ value: { ...reader.report, tier: 3 } })).toMatchObject({
				refused: 'schema',
				faults: [expect.stringContaining('tier')],
			})
		})
	}
})
