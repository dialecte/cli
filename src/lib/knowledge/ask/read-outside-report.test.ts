import {
	OUTSIDE_REPORT,
	OUTSIDE_REPORT_WITHOUT_ANSWER,
	OUTSIDE_REPORT_WITHOUT_SESSION,
	OUTSIDE_WEB_CITE,
} from '../../../../test/ask-report-fixtures.constants.ts'
import { readOutsideReport } from './read-outside-report.ts'

import { describe, expect, it } from 'vitest'

const REQUIRED_FIELDS = [
	'ask',
	'round',
	'reader',
	'nonce',
	'source',
	'verdict',
	'value',
	'answer',
	'claims',
	'notFound',
	'familiesRead',
]

const WEB_REPORT = {
	...OUTSIDE_REPORT,
	source: 'web',
	claims: [{ text: 'D holds DD_1', supports: 'yes', cites: [OUTSIDE_WEB_CITE] }],
}

describe('readOutsideReport: the outside schema, every fault named at once (D9, spec section 18)', () => {
	it('a whole model report -> the report', () => {
		expect(readOutsideReport({ value: OUTSIDE_REPORT })).toEqual({ report: OUTSIDE_REPORT })
	})

	it('a whole web report with url, quote and retrieved on its cite -> the report', () => {
		expect(readOutsideReport({ value: WEB_REPORT })).toEqual({ report: WEB_REPORT })
	})

	it('a not-known verdict is allowed outside -> the report', () => {
		const unknown = { ...OUTSIDE_REPORT, verdict: 'not-known', claims: [] }
		expect(readOutsideReport({ value: unknown })).toEqual({ report: unknown })
	})

	it('a null session is read: acceptance refuses it, not the schema', () => {
		const unsessioned = { ...OUTSIDE_REPORT, session: null }
		expect(readOutsideReport({ value: unsessioned })).toEqual({ report: unsessioned })
	})

	it('an absent session is read too: acceptance refuses it, not the schema', () => {
		expect(readOutsideReport({ value: OUTSIDE_REPORT_WITHOUT_SESSION })).toMatchObject({
			report: { ask: 'A-0007', source: 'model' },
		})
	})

	it('an outside report with no answer -> refused schema naming answer', () => {
		expect(readOutsideReport({ value: OUTSIDE_REPORT_WITHOUT_ANSWER })).toEqual({
			refused: 'schema',
			faults: [expect.stringContaining('answer')],
		})
	})

	it('an outside report with an empty answer -> refused schema naming answer', () => {
		expect(readOutsideReport({ value: { ...OUTSIDE_REPORT, answer: '' } })).toEqual({
			refused: 'schema',
			faults: [expect.stringContaining('answer')],
		})
	})

	it('an empty object -> refused schema, one fault for each of the 11 required fields', () => {
		expect(readOutsideReport({ value: {} })).toEqual({
			refused: 'schema',
			faults: Array.from({ length: REQUIRED_FIELDS.length }, () => expect.any(String)),
		})
	})

	for (const field of REQUIRED_FIELDS)
		it(`an empty object -> a fault names the missing field ${field}`, () => {
			expect(readOutsideReport({ value: {} })).toMatchObject({
				refused: 'schema',
				faults: expect.arrayContaining([expect.stringContaining(field)]),
			})
		})

	it('a source that is neither model nor web, and a bad verdict -> both named at once', () => {
		expect(
			readOutsideReport({ value: { ...OUTSIDE_REPORT, source: 'book', verdict: 'maybe' } }),
		).toMatchObject({
			refused: 'schema',
			faults: [expect.stringContaining('source'), expect.stringContaining('verdict')],
		})
	})

	it('a web cite with no url and no retrieved date -> the faults carry their path', () => {
		const wrong = {
			...WEB_REPORT,
			claims: [
				{ text: 'D holds DD_1', supports: 'yes', cites: [{ quote: OUTSIDE_WEB_CITE.quote }] },
			],
		}
		expect(readOutsideReport({ value: wrong })).toEqual({
			refused: 'schema',
			faults: [
				expect.stringContaining('claims[0].cites[0].url'),
				expect.stringContaining('claims[0].cites[0].retrieved'),
			],
		})
	})

	it('a value that is no object -> refused schema with one fault', () => {
		expect(readOutsideReport({ value: null })).toEqual({
			refused: 'schema',
			faults: [expect.any(String)],
		})
	})
})
