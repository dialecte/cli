import { DOCUMENT_REPORT } from '../../../../test/ask-report-fixtures.constants.ts'
import { reportBodyOf } from './report-body-of.ts'

import { describe, expect, it } from 'vitest'

import type { DocumentReport } from './ask.types.ts'

const FIRST_CLAIM = DOCUMENT_REPORT.claims[0]!

describe('reportBodyOf: the body is verdict, value, answer and claims, whitespace folded', () => {
	it('two reports differing in ask, round, reader, nonce, session and what was searched have one body', () => {
		const other: DocumentReport = {
			...DOCUMENT_REPORT,
			ask: 'A-0008',
			round: 2,
			reader: 'A',
			nonce: 'nonce-a-2',
			session: 'session-a',
			notFound: ['something'],
			familiesRead: ['tables'],
		}
		expect(
			new Set([reportBodyOf({ report: DOCUMENT_REPORT }), reportBodyOf({ report: other })]).size,
		).toBe(1)
	})

	it('whitespace in the answer and in a claim does not make another body', () => {
		const spaced: DocumentReport = {
			...DOCUMENT_REPORT,
			answer: '  The element  D holds\nthe child DD_1.  ',
			claims: [{ ...FIRST_CLAIM, text: 'D  shall\thold DD_1 ' }],
		}
		expect(
			new Set([reportBodyOf({ report: DOCUMENT_REPORT }), reportBodyOf({ report: spaced })]).size,
		).toBe(1)
	})

	it('another answer sentence is another body', () => {
		const reworded: DocumentReport = { ...DOCUMENT_REPORT, answer: 'D holds DD_1, as listed.' }
		expect(
			new Set([reportBodyOf({ report: DOCUMENT_REPORT }), reportBodyOf({ report: reworded })]).size,
		).toBe(2)
	})

	it('another claim wording is another body', () => {
		const reworded: DocumentReport = {
			...DOCUMENT_REPORT,
			claims: [{ ...FIRST_CLAIM, text: 'DD_1 is listed under D' }],
		}
		expect(
			new Set([reportBodyOf({ report: DOCUMENT_REPORT }), reportBodyOf({ report: reworded })]).size,
		).toBe(2)
	})

	it('another verdict is another body', () => {
		const dissent: DocumentReport = { ...DOCUMENT_REPORT, verdict: 'no' }
		expect(
			new Set([reportBodyOf({ report: DOCUMENT_REPORT }), reportBodyOf({ report: dissent })]).size,
		).toBe(2)
	})

	it('another value is another body', () => {
		const valued: DocumentReport = { ...DOCUMENT_REPORT, value: 'enabled' }
		expect(
			new Set([reportBodyOf({ report: DOCUMENT_REPORT }), reportBodyOf({ report: valued })]).size,
		).toBe(2)
	})
})
