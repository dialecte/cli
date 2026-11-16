import { WEB_CITE_ONE, WEB_CITE_TWO } from '../../../../test/ask-agreement-fixtures.constants.ts'
import {
	AGREED_DOCUMENTS,
	AGREED_OUTSIDE,
	DOCUMENTS_REQUEST,
	FACT_SUBJECT,
	OUTSIDE_REQUEST,
	STANDARD_KEYS,
	TIERS,
} from '../../../../test/ask-fact-draft-fixtures.constants.ts'
import { factDraftOf } from './fact-draft-of.ts'

import { describe, expect, it } from 'vitest'

import type { FactDraftOfParams } from './ask.types.ts'

/** The draft of a documents round at medium: two readers, one round, no adjudicator, unless said. */
function documentsOf(params: Partial<FactDraftOfParams> = {}): FactDraftOfParams {
	return {
		ask: 'A-0003',
		request: DOCUMENTS_REQUEST,
		subject: FACT_SUBJECT,
		agreed: AGREED_DOCUMENTS,
		outside: null,
		standards: STANDARD_KEYS,
		rounds: 1,
		adjudicator: false,
		tiers: TIERS,
		...params,
	}
}

describe('factDraftOf: a documents answer is recorded as a standard fact (section 9)', () => {
	it('the agreed answer, the union of verified cites as evidence and the files key of each folder as sources', () => {
		expect(factDraftOf(documentsOf())).toEqual({
			question: DOCUMENTS_REQUEST.question,
			subject: FACT_SUBJECT,
			kind: DOCUMENTS_REQUEST.kind,
			answer: {
				verdict: AGREED_DOCUMENTS.verdict,
				value: AGREED_DOCUMENTS.value,
				text: AGREED_DOCUMENTS.answer,
			},
			source: 'standard',
			effort: DOCUMENTS_REQUEST.effort,
			evidence: AGREED_DOCUMENTS.cites,
			by: { rung: 4, readers: 2, rounds: 1, adjudicator: false, person: null, tiers: TIERS },
			sources: STANDARD_KEYS.map((folder) => ({
				kind: 'standard',
				standard: folder.id,
				files: folder.files,
			})),
		})
	})

	it('a standard fact is no unchecked fact: the draft carries no unchecked member', () => {
		expect(factDraftOf(documentsOf())).not.toHaveProperty('unchecked')
	})

	it('the rounds spent are recorded', () => {
		expect(factDraftOf(documentsOf({ rounds: 3 }))).toMatchObject({ by: { rounds: 3 } })
	})

	it('the adjudicator answered -> rung 5 and adjudicator: true', () => {
		expect(factDraftOf(documentsOf({ adjudicator: true, rounds: 3 }))).toMatchObject({
			by: { rung: 5, adjudicator: true, person: null },
		})
	})

	it('three agreeing readers at high -> readers: 3 and the ask effort', () => {
		const agreed = { ...AGREED_DOCUMENTS, letters: ['A', 'B', 'C'] }
		const request = { ...DOCUMENTS_REQUEST, effort: 'high' as const }

		expect(factDraftOf(documentsOf({ agreed, request }))).toMatchObject({
			effort: 'high',
			by: { readers: 3 },
		})
	})
})

describe('factDraftOf: an outside answer is an unchecked fact named by its sources (case 32i)', () => {
	/** The draft of an outside round at medium: the outside request, no standard folder. */
	function outsideDraftOf(params: Pick<FactDraftOfParams, 'outside'>): FactDraftOfParams {
		return documentsOf({
			request: OUTSIDE_REQUEST,
			agreed: AGREED_OUTSIDE,
			standards: [],
			outside: params.outside,
		})
	}

	it('two model readers -> the whole unchecked outside draft: one model source, no evidence, no standard key', () => {
		const outside = { sources: [{ source: 'model' as const, urls: [] }], cites: [] }

		expect(factDraftOf(outsideDraftOf({ outside }))).toEqual({
			question: OUTSIDE_REQUEST.question,
			subject: FACT_SUBJECT,
			kind: OUTSIDE_REQUEST.kind,
			answer: {
				verdict: AGREED_OUTSIDE.verdict,
				value: AGREED_OUTSIDE.value,
				text: AGREED_OUTSIDE.answer,
			},
			source: 'outside',
			unchecked: true,
			effort: OUTSIDE_REQUEST.effort,
			evidence: [],
			by: { rung: 4, readers: 2, rounds: 1, adjudicator: false, person: null, tiers: TIERS },
			sources: [{ kind: 'model' }],
		})
	})

	it('one web reader and one model reader -> both kinds, the urls kept, the web cites as evidence', () => {
		const outside = {
			sources: [
				{ source: 'model' as const, urls: [] },
				{ source: 'web' as const, urls: [WEB_CITE_ONE.url, WEB_CITE_TWO.url] },
			],
			cites: [WEB_CITE_ONE, WEB_CITE_TWO],
		}

		expect(factDraftOf(outsideDraftOf({ outside }))).toEqual({
			question: OUTSIDE_REQUEST.question,
			subject: FACT_SUBJECT,
			kind: OUTSIDE_REQUEST.kind,
			answer: {
				verdict: AGREED_OUTSIDE.verdict,
				value: AGREED_OUTSIDE.value,
				text: AGREED_OUTSIDE.answer,
			},
			source: 'outside',
			unchecked: true,
			effort: OUTSIDE_REQUEST.effort,
			evidence: [WEB_CITE_ONE, WEB_CITE_TWO],
			by: { rung: 4, readers: 2, rounds: 1, adjudicator: false, person: null, tiers: TIERS },
			sources: [{ kind: 'model' }, { kind: 'web', urls: [WEB_CITE_ONE.url, WEB_CITE_TWO.url] }],
		})
	})
})
