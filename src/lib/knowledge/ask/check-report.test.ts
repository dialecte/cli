import { bodyHashOf } from '../../../../test/ask-body-hash.ts'
import { NEGATING_REPORT_CITES } from '../../../../test/ask-check-report-helper.constants.ts'
import { checkedReportOf } from '../../../../test/ask-check-report-helper.ts'
import {
	ACCEPTANCE,
	DOCUMENT_REPORT,
	QUOTE_D_SHALL_NOT,
	REPORT_FILE,
} from '../../../../test/ask-report-fixtures.constants.ts'
import { citeContextOf } from '../../../../test/ask-report-fixtures.ts'
import { ANOTHER_BODY_HASH } from '../../../../test/ask-review-1-fixtures.constants.ts'

import { describe, expect, it } from 'vitest'

import type { ReportRow } from '../../../../test/ask-check-report-helper.types.ts'
import type { DocumentReport } from './ask.types.ts'

/** What a refused report holds: not accepted, and the reason. */
function refusedAs(reason: string): Record<string, unknown> {
	return { accepted: false, refused: reason }
}

const FIRST_CLAIM = DOCUMENT_REPORT.claims[0]!
const ROW_TEXT_OF_D = 'D DD_1 optional'

/** The report of reader A, of its own nonce, session and wording, quoting one whole table row. */
const TABLE_REPORT_A: DocumentReport = {
	...DOCUMENT_REPORT,
	reader: 'A',
	nonce: 'nonce-a-1',
	session: 'session-a',
	answer: 'D holds DD_1.',
	claims: [
		{
			text: 'D holds DD_1',
			supports: 'yes',
			cites: [{ file: REPORT_FILE, from: 12, to: 12, quote: ROW_TEXT_OF_D }],
		},
	],
}
const TABLE_REPORT_B: DocumentReport = {
	...TABLE_REPORT_A,
	reader: 'B',
	nonce: 'nonce-b-1',
	session: 'session-b',
	answer: 'The child DD_1 is optional under D.',
	claims: [
		{
			text: 'DD_1 is optional under D',
			supports: 'yes',
			cites: [{ file: REPORT_FILE, from: 12, to: 12, quote: ROW_TEXT_OF_D }],
		},
	],
}
const TABLE_CITES = citeContextOf({
	lines: [{ from: 12, to: 12, kind: 'table', text: ROW_TEXT_OF_D }],
})

describe('checkReport: schema, ask, round and nonce (cases 24, 25, K3-a)', () => {
	const rows: Record<string, ReportRow> = {
		'a whole report with a verified claim backing its verdict -> accepted, not hedged': {
			case: { value: DOCUMENT_REPORT },
			expected: { accepted: true, notKnown: false, claims: [{ verified: true, refused: null }] },
		},
		'a report missing its fields -> refused schema with the faults listed': {
			case: { value: {} },
			expected: { ...refusedAs('schema'), faults: expect.arrayContaining([expect.any(String)]) },
		},
		'32s: a document report carrying source -> refused schema': {
			case: { value: { ...DOCUMENT_REPORT, source: 'model' } },
			expected: refusedAs('schema'),
		},
		'32s: a document report with a not-known verdict -> refused schema': {
			case: { value: { ...DOCUMENT_REPORT, verdict: 'not-known', claims: [] } },
			expected: refusedAs('schema'),
		},
		'K3-a: a report naming another ask -> wrong-ask': {
			case: { value: { ...DOCUMENT_REPORT, ask: 'A-0099' } },
			expected: refusedAs('wrong-ask'),
		},
		'a report of a round that is not the open one -> wrong-round': {
			case: { value: { ...DOCUMENT_REPORT, round: 2 } },
			expected: refusedAs('wrong-round'),
		},
		'25: a report of the first round replayed in the second, whose nonces are others -> wrong-round':
			{
				case: {
					value: DOCUMENT_REPORT,
					acceptance: {
						...ACCEPTANCE,
						round: 2,
						issued: [
							{ reader: 'A', nonce: 'nonce-a-2' },
							{ reader: 'B', nonce: 'nonce-b-2' },
						],
					},
				},
				expected: refusedAs('wrong-round'),
			},
		'24: a nonce issued to another reader -> nonce': {
			case: { value: { ...DOCUMENT_REPORT, nonce: 'nonce-a-1' } },
			expected: refusedAs('nonce'),
		},
		'a report naming another ask with a nonce nobody was issued -> wrong-ask (the ask is checked before the nonce)':
			{
				case: { value: { ...DOCUMENT_REPORT, ask: 'A-0099', nonce: 'nonce-unknown' } },
				expected: refusedAs('wrong-ask'),
			},
		'a nonce nobody was issued -> nonce': {
			case: { value: { ...DOCUMENT_REPORT, nonce: 'nonce-unknown' } },
			expected: refusedAs('nonce'),
		},
		'24: a nonce already used -> nonce': {
			case: { value: DOCUMENT_REPORT, acceptance: { ...ACCEPTANCE, used: ['nonce-b-1'] } },
			expected: refusedAs('nonce'),
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkedReportOf(row.case)).toMatchObject(row.expected)
		})
})

describe('checkReport: session and identical body (cases 24, 24b, 26)', () => {
	it('26: a session an accepted report already holds -> same-session', () => {
		expect(
			checkedReportOf({
				value: DOCUMENT_REPORT,
				acceptance: {
					...ACCEPTANCE,
					accepted: [{ session: 'session-b', bodyHash: ANOTHER_BODY_HASH }],
				},
			}),
		).toMatchObject(refusedAs('same-session'))
	})

	it('the same session and the same body as an accepted report -> same-session (before duplicate)', () => {
		expect(
			checkedReportOf({
				value: DOCUMENT_REPORT,
				acceptance: {
					...ACCEPTANCE,
					accepted: [{ session: 'session-b', bodyHash: bodyHashOf({ report: DOCUMENT_REPORT }) }],
				},
			}),
		).toMatchObject(refusedAs('same-session'))
	})

	it('a report with no session next to an accepted report with none -> not the same session', () => {
		expect(
			checkedReportOf({
				value: { ...DOCUMENT_REPORT, session: null },
				acceptance: { ...ACCEPTANCE, accepted: [{ session: null, bodyHash: ANOTHER_BODY_HASH }] },
			}),
		).toMatchObject({ accepted: true })
	})

	it('24: the same body with the reader letter and nonce edited, from another session -> duplicate', () => {
		const edited = { ...DOCUMENT_REPORT, reader: 'A', nonce: 'nonce-a-1', session: 'session-a' }
		expect(
			checkedReportOf({
				value: edited,
				acceptance: {
					...ACCEPTANCE,
					accepted: [{ session: 'session-b', bodyHash: bodyHashOf({ report: DOCUMENT_REPORT }) }],
				},
			}),
		).toMatchObject(refusedAs('duplicate'))
	})

	it('24b: two honest readers quoting one table row with their own answer and claim wording -> both accepted', () => {
		expect([
			checkedReportOf({ value: TABLE_REPORT_A, cites: TABLE_CITES }),
			checkedReportOf({
				value: TABLE_REPORT_B,
				cites: TABLE_CITES,
				acceptance: {
					...ACCEPTANCE,
					accepted: [{ session: 'session-a', bodyHash: bodyHashOf({ report: TABLE_REPORT_A }) }],
				},
			}),
		]).toMatchObject([{ accepted: true }, { accepted: true }])
	})
})

describe('checkReport: a verified claim backing the verdict, or not-in-text with no claim', () => {
	it('a report whose only claim lacks a key term of its quote -> no-verified-claim', () => {
		const claimed = { ...FIRST_CLAIM, text: 'D shall hold AA_1' }
		expect(checkedReportOf({ value: { ...DOCUMENT_REPORT, claims: [claimed] } })).toMatchObject(
			refusedAs('no-verified-claim'),
		)
	})

	it('a report whose only claim backs another verdict than the report -> no-verified-claim', () => {
		const claimed = { ...FIRST_CLAIM, supports: 'no' }
		expect(checkedReportOf({ value: { ...DOCUMENT_REPORT, claims: [claimed] } })).toMatchObject(
			refusedAs('no-verified-claim'),
		)
	})

	it('a report whose only cite is outside every slice given -> no-verified-claim', () => {
		const claimed = {
			...FIRST_CLAIM,
			cites: [{ ...FIRST_CLAIM.cites[0], from: 50, to: 51 }],
		}
		expect(checkedReportOf({ value: { ...DOCUMENT_REPORT, claims: [claimed] } })).toMatchObject(
			refusedAs('no-verified-claim'),
		)
	})

	it('a verdict yes with no claim at all -> no-verified-claim', () => {
		expect(checkedReportOf({ value: { ...DOCUMENT_REPORT, claims: [] } })).toMatchObject(
			refusedAs('no-verified-claim'),
		)
	})

	it('not-in-text with any claim, even a verified one -> no-verified-claim', () => {
		const withClaim = { ...DOCUMENT_REPORT, verdict: 'not-in-text', claims: [FIRST_CLAIM] }
		expect(checkedReportOf({ value: withClaim })).toMatchObject(refusedAs('no-verified-claim'))
	})

	it('not-in-text with no claims -> accepted', () => {
		const nothing = {
			...DOCUMENT_REPORT,
			verdict: 'not-in-text',
			claims: [],
			answer: 'Nothing was found.',
		}
		expect(checkedReportOf({ value: nothing })).toMatchObject({ accepted: true, notKnown: false })
	})

	it('one refused claim next to one verified claim -> accepted, each claim with its own result', () => {
		const refusedClaim = { ...FIRST_CLAIM, text: 'D shall hold AA_1' }
		expect(
			checkedReportOf({ value: { ...DOCUMENT_REPORT, claims: [refusedClaim, FIRST_CLAIM] } }),
		).toMatchObject({ accepted: true, claims: [{ verified: false }, { verified: true }] })
	})

	it('a verified claim in polarity conflict -> accepted, the claim marked (it never counts toward agreement)', () => {
		const cites = NEGATING_REPORT_CITES
		const negated = {
			...FIRST_CLAIM,
			cites: [{ ...FIRST_CLAIM.cites[0], quote: QUOTE_D_SHALL_NOT }],
		}
		expect(
			checkedReportOf({ value: { ...DOCUMENT_REPORT, claims: [negated] }, cites }),
		).toMatchObject({
			accepted: true,
			claims: [{ polarityConflict: true }],
		})
	})
})
