/** Whole values of the fact draft cases: the request, the subject, what was agreed, the folders keys, the tiers. */
import { ANSWER_SHORT } from './ask-agreement-fixtures.constants.ts'
import { QUOTE_D_POSITIVE, REPORT_FILE } from './ask-report-fixtures.constants.ts'

import type { AskRequestRecord, Agreed } from '../src/lib/knowledge/ask/ask.types.ts'
import type { FactSubject } from '../src/lib/knowledge/facts/facts.types.ts'

/** The request record of a documents ask at medium, and the subject it recorded. */
export const DOCUMENTS_REQUEST: AskRequestRecord = {
	schema: 1,
	question: 'Explain the intent of AA_1',
	about: null,
	code: null,
	method: null,
	package: null,
	kind: 'semantic',
	decision: false,
	limit: 5,
	effort: 'medium',
	documents: true,
	standard: {
		name: 'Example 0000',
		key: 'example0000',
		folders: ['example-0000'],
		files: [{ id: REPORT_FILE, sha256: 'sha-one', lines: 200 }],
	},
}
/** The request record of an ask with no documents: the outside route, the standard named only. */
export const OUTSIDE_REQUEST: AskRequestRecord = {
	...DOCUMENTS_REQUEST,
	documents: false,
	standard: { name: 'Example 0000', key: 'example0000', folders: [], files: [] },
}
export const FACT_SUBJECT: FactSubject = {
	package: null,
	tags: [{ tag: 'AA_1', parent: null }],
	attributes: [],
	codes: [],
	methods: [],
}

/** What two readers agreed on in the documents: their verified cites and their letters. */
export const AGREED_DOCUMENTS: Agreed = {
	verdict: 'yes',
	value: null,
	answer: ANSWER_SHORT,
	cites: [
		{ file: REPORT_FILE, from: 12, to: 13, quote: QUOTE_D_POSITIVE },
		{ file: REPORT_FILE, from: 13, to: 14, quote: QUOTE_D_POSITIVE },
	],
	letters: ['A', 'B'],
}

/** What two outside readers agreed on: no document cite. */
export const AGREED_OUTSIDE: Agreed = { ...AGREED_DOCUMENTS, cites: [] }

/** The files key of each folder of the standard, as the manifest says now. */
export const STANDARD_KEYS = [
	{
		id: 'example-0000',
		files: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
	},
]

/** The tiers of the models the readers ran on. */
export const TIERS = ['standard']
