import { DOCUMENT_REPORT, REPORT_FILE } from '../../../../test/ask-report-fixtures.constants.ts'
import { readDocumentReport } from './read-document-report.ts'

import { describe, expect, it } from 'vitest'

const REQUIRED_FIELDS = [
	'ask',
	'round',
	'reader',
	'nonce',
	'verdict',
	'value',
	'answer',
	'claims',
	'notFound',
	'familiesRead',
	'session',
]

const NOT_AN_OBJECT: Record<string, unknown> = { null: null, text: 'text', 'a list': [] }

describe('readDocumentReport: a whole report is read, every fault of a bad one is named at once (D9, case 1)', () => {
	it('a whole report -> the report', () => {
		expect(readDocumentReport({ value: DOCUMENT_REPORT })).toEqual({ report: DOCUMENT_REPORT })
	})

	it('a report with no session (null) and a value -> the report', () => {
		const valued = { ...DOCUMENT_REPORT, verdict: 'value', value: 'enabled', session: null }
		expect(readDocumentReport({ value: valued })).toEqual({ report: valued })
	})

	it('an empty object -> refused schema, one fault for each of the 11 fields', () => {
		expect(readDocumentReport({ value: {} })).toEqual({
			refused: 'schema',
			faults: Array.from({ length: REQUIRED_FIELDS.length }, () => expect.any(String)),
		})
	})

	for (const field of REQUIRED_FIELDS)
		it(`an empty object -> a fault names the missing field ${field}`, () => {
			expect(readDocumentReport({ value: {} })).toMatchObject({
				refused: 'schema',
				faults: expect.arrayContaining([expect.stringContaining(field)]),
			})
		})

	it('wrong types in four fields -> refused schema with exactly those four named, at once', () => {
		const wrong = {
			...DOCUMENT_REPORT,
			round: '1',
			verdict: 'maybe',
			claims: 'none',
			notFound: [3],
		}
		expect(readDocumentReport({ value: wrong })).toMatchObject({
			refused: 'schema',
			faults: [
				expect.stringContaining('round'),
				expect.stringContaining('verdict'),
				expect.stringContaining('claims'),
				expect.stringContaining('notFound[0]'),
			],
		})
	})

	it('a claim with a bad verdict and a cite with a bad line and no quote -> the faults carry their path', () => {
		const wrong = {
			...DOCUMENT_REPORT,
			claims: [
				{
					text: 'D shall hold DD_1',
					supports: 'maybe',
					cites: [{ file: REPORT_FILE, from: 'x', to: 13 }],
				},
			],
		}
		expect(readDocumentReport({ value: wrong })).toEqual({
			refused: 'schema',
			faults: [
				expect.stringContaining('claims[0].supports'),
				expect.stringContaining('claims[0].cites[0].from'),
				expect.stringContaining('claims[0].cites[0].quote'),
			],
		})
	})

	for (const [name, value] of Object.entries(NOT_AN_OBJECT))
		it(`a value that is no object (${name}) -> refused schema with one fault`, () => {
			expect(readDocumentReport({ value })).toEqual({
				refused: 'schema',
				faults: [expect.any(String)],
			})
		})

	it('32s: a document report carrying source -> refused schema naming source', () => {
		expect(readDocumentReport({ value: { ...DOCUMENT_REPORT, source: 'model' } })).toMatchObject({
			refused: 'schema',
			faults: [expect.stringContaining('source')],
		})
	})

	it('32s: a document report with a not-known verdict -> refused schema naming not-known', () => {
		expect(
			readDocumentReport({ value: { ...DOCUMENT_REPORT, verdict: 'not-known' } }),
		).toMatchObject({
			refused: 'schema',
			faults: [expect.stringContaining('not-known')],
		})
	})
})
