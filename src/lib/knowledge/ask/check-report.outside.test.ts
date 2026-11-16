import { bodyHashOf } from '../../../../test/ask-body-hash.ts'
import { checkedReportOf } from '../../../../test/ask-check-report-helper.ts'
import {
	ACCEPTANCE,
	FORTY_ONE_WORDS,
	OUTSIDE_REPORT,
	OUTSIDE_REPORT_WITHOUT_ANSWER,
	OUTSIDE_REPORT_WITHOUT_SESSION,
	OUTSIDE_REPORT_WITHOUT_SOURCE,
	OUTSIDE_WEB_CITE,
	QUOTE_D_EXCEPT,
	QUOTE_D_SHALL_NOT,
	REPORT_FILE,
} from '../../../../test/ask-report-fixtures.constants.ts'
import { ANOTHER_BODY_HASH } from '../../../../test/ask-review-1-fixtures.constants.ts'

import { describe, expect, it } from 'vitest'

import type { ReportRow } from '../../../../test/ask-check-report-helper.types.ts'

/** What a refused report holds: not accepted, and the reason. */
function refusedAs(reason: string): Record<string, unknown> {
	return { accepted: false, refused: reason }
}

const FIRST_CLAIM = OUTSIDE_REPORT.claims[0]!
const WEB_CLAIM = { ...FIRST_CLAIM, cites: [OUTSIDE_WEB_CITE] }

describe('checkReport, outside: the acceptance table of the outside report (cases 32n, 32p, 32q)', () => {
	const rows: Record<string, ReportRow> = {
		'a whole model report, claims with no cite -> accepted, not hedged': {
			case: { value: OUTSIDE_REPORT, outside: true },
			expected: { accepted: true, notKnown: false },
		},
		'a report with no session (null) -> session-missing': {
			case: { value: { ...OUTSIDE_REPORT, session: null }, outside: true },
			expected: refusedAs('session-missing'),
		},
		'a report with no session field at all -> session-missing': {
			case: { value: OUTSIDE_REPORT_WITHOUT_SESSION, outside: true },
			expected: refusedAs('session-missing'),
		},
		'32q: a second report from a session an accepted report holds -> same-session': {
			case: {
				value: OUTSIDE_REPORT,
				outside: true,
				acceptance: {
					...ACCEPTANCE,
					accepted: [{ session: 'session-b', bodyHash: ANOTHER_BODY_HASH }],
				},
			},
			expected: refusedAs('same-session'),
		},
		'32q: a second report with a nonce already used -> nonce': {
			case: {
				value: OUTSIDE_REPORT,
				outside: true,
				acceptance: { ...ACCEPTANCE, used: ['nonce-b-1'] },
			},
			expected: refusedAs('nonce'),
		},
		'a nonce issued to another reader -> nonce': {
			case: { value: { ...OUTSIDE_REPORT, nonce: 'nonce-a-1' }, outside: true },
			expected: refusedAs('nonce'),
		},
		'32n: a claim citing file lines -> document-cite-outside': {
			case: {
				value: {
					...OUTSIDE_REPORT,
					claims: [
						{
							...FIRST_CLAIM,
							cites: [{ file: REPORT_FILE, from: 12, to: 13, quote: OUTSIDE_WEB_CITE.quote }],
						},
					],
				},
				outside: true,
			},
			expected: refusedAs('document-cite-outside'),
		},
		'32p: source web when the pack was not made with web -> web-not-allowed': {
			case: { value: { ...OUTSIDE_REPORT, source: 'web', claims: [WEB_CLAIM] }, outside: true },
			expected: refusedAs('web-not-allowed'),
		},
		'source web when the pack allowed web -> accepted': {
			case: {
				value: { ...OUTSIDE_REPORT, source: 'web', claims: [WEB_CLAIM] },
				outside: true,
				acceptance: { ...ACCEPTANCE, web: true },
			},
			expected: { accepted: true },
		},
		'32p: a url in a model report -> url-in-model-report': {
			case: { value: { ...OUTSIDE_REPORT, claims: [WEB_CLAIM] }, outside: true },
			expected: refusedAs('url-in-model-report'),
		},
		'a report that is not an outside report (no source) -> schema': {
			case: { value: OUTSIDE_REPORT_WITHOUT_SOURCE, outside: true },
			expected: refusedAs('schema'),
		},
		'an outside report with no answer -> schema': {
			case: { value: OUTSIDE_REPORT_WITHOUT_ANSWER, outside: true },
			expected: refusedAs('schema'),
		},
		'an outside report with an empty answer -> schema': {
			case: { value: { ...OUTSIDE_REPORT, answer: '' }, outside: true },
			expected: refusedAs('schema'),
		},
		'an outside report naming another ask -> wrong-ask': {
			case: { value: { ...OUTSIDE_REPORT, ask: 'A-0099' }, outside: true },
			expected: refusedAs('wrong-ask'),
		},
		'an outside report of a round that is not the open one -> wrong-round': {
			case: { value: { ...OUTSIDE_REPORT, round: 2 }, outside: true },
			expected: refusedAs('wrong-round'),
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkedReportOf(row.case)).toMatchObject(row.expected)
		})

	it('a second report whose body equals an accepted one, from another session and nonce -> duplicate', () => {
		const edited = { ...OUTSIDE_REPORT, reader: 'A', nonce: 'nonce-a-1', session: 'session-a' }
		expect(
			checkedReportOf({
				value: edited,
				outside: true,
				acceptance: {
					...ACCEPTANCE,
					accepted: [{ session: 'session-b', bodyHash: bodyHashOf({ report: OUTSIDE_REPORT }) }],
				},
			}),
		).toMatchObject(refusedAs('duplicate'))
	})
})

describe('checkReport, outside: hedge words and not-known make the report not known (32h, 32o)', () => {
	const hedged: Record<string, string> = {
		probably: 'D probably holds DD_1.',
		likely: 'D likely holds DD_1.',
		'I believe': 'I believe D holds DD_1.',
		'I think': 'I think D holds DD_1.',
		might: 'D might hold DD_1.',
		possibly: 'D possibly holds DD_1.',
		seems: 'It seems D holds DD_1.',
		'as far as I know': 'As far as I know D holds DD_1.',
	}

	for (const [word, answer] of Object.entries(hedged))
		it(`32o: an answer holding "${word}" -> accepted, counted not known`, () => {
			expect(
				checkedReportOf({ value: { ...OUTSIDE_REPORT, answer }, outside: true }),
			).toMatchObject({
				accepted: true,
				notKnown: true,
			})
		})

	it('a hedge word inside another word (mighty) -> accepted, not hedged', () => {
		const answer = 'The mighty element D holds DD_1.'
		expect(checkedReportOf({ value: { ...OUTSIDE_REPORT, answer }, outside: true })).toMatchObject({
			accepted: true,
			notKnown: false,
		})
	})

	it('32h: a not-known verdict with no claim -> accepted, counted not known', () => {
		const unknown = {
			...OUTSIDE_REPORT,
			verdict: 'not-known',
			claims: [],
			answer: 'Nothing is known of it.',
		}
		expect(checkedReportOf({ value: unknown, outside: true })).toMatchObject({
			accepted: true,
			notKnown: true,
		})
	})
})

describe('checkReport, outside: polarity comparison 2 only (claim against the question wording)', () => {
	it('a negating claim backing yes under a positive question -> accepted, the claim marked in conflict', () => {
		const negated = { ...FIRST_CLAIM, text: 'D shall not hold DD_1', supports: 'yes' }
		expect(
			checkedReportOf({ value: { ...OUTSIDE_REPORT, claims: [negated] }, outside: true }),
		).toMatchObject({ accepted: true, claims: [{ polarityConflict: true }] })
	})

	it('a plain claim backing yes under a positive question -> accepted, no conflict', () => {
		expect(checkedReportOf({ value: OUTSIDE_REPORT, outside: true })).toMatchObject({
			accepted: true,
			claims: [{ polarityConflict: false }],
		})
	})

	const webQuotes: Record<string, string> = {
		'shall not': QUOTE_D_SHALL_NOT,
		except: QUOTE_D_EXCEPT,
	}

	for (const [cue, quote] of Object.entries(webQuotes))
		it(`a web quote with ${cue} near D, a plain unhedged claim -> accepted, no conflict (the quote is not compared)`, () => {
			const cited = { ...FIRST_CLAIM, cites: [{ ...OUTSIDE_WEB_CITE, quote }] }
			expect(
				checkedReportOf({
					value: { ...OUTSIDE_REPORT, source: 'web', claims: [cited] },
					outside: true,
					acceptance: { ...ACCEPTANCE, web: true },
				}),
			).toMatchObject({ accepted: true, notKnown: false, claims: [{ polarityConflict: false }] })
		})
})

describe('checkReport, outside: a web quote is 8 to 40 words (quote-length)', () => {
	const rows: Record<string, { count: number; expected: Record<string, unknown> }> = {
		'7 words -> quote-length': { count: 7, expected: refusedAs('quote-length') },
		'8 words -> accepted': { count: 8, expected: { accepted: true } },
		'40 words -> accepted': { count: 40, expected: { accepted: true } },
		'41 words -> quote-length': { count: 41, expected: refusedAs('quote-length') },
	}

	for (const [name, row] of Object.entries(rows))
		it(`a web quote of ${name}`, () => {
			const quote = FORTY_ONE_WORDS.slice(0, row.count).join(' ')
			const cited = { ...FIRST_CLAIM, cites: [{ ...OUTSIDE_WEB_CITE, quote }] }
			expect(
				checkedReportOf({
					value: { ...OUTSIDE_REPORT, source: 'web', claims: [cited] },
					outside: true,
					acceptance: { ...ACCEPTANCE, web: true },
				}),
			).toMatchObject(row.expected)
		})
})
