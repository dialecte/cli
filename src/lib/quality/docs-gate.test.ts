/** `findDocsNotUpdated` and `docsGateApplies`: a public API change asks for the doc pages naming it. */
import { docsGateApplies, findDocsNotUpdated } from './docs-gate.ts'

import { describe, expect, it } from 'vitest'

import type { ApiEntryChange } from '../risk/risk.types.ts'
import type { DocPage, DocsNotUpdated } from './quality.types.ts'

const RESIGNED: ApiEntryChange = {
	path: 'doc.query.info.of',
	change: 'signature',
	declaredAt: 'src/info.ts:4',
}

const QUERY_PAGE = [
	'# Query',
	'',
	'`info.of(record)` reads what the standard says of a record.',
	'',
].join('\n')

const OTHER_PAGE = ['# Other', '', 'Each record of the document is kept in the store.', ''].join(
	'\n',
)

describe('findDocsNotUpdated', () => {
	const testCases: Record<
		string,
		{ entries: ApiEntryChange[]; pages: DocPage[]; expected: DocsNotUpdated[] }
	> = {
		'a re-signed entry a page names, the page untouched → one finding naming the page': {
			entries: [RESIGNED],
			pages: [{ path: 'doc/api/query.md', text: QUERY_PAGE, touched: false }],
			expected: [
				{
					route: 'doc.query.info.of',
					change: 'signature',
					declaredAt: 'src/info.ts:4',
					pages: ['doc/api/query.md'],
				},
			],
		},
		'the same, the page touched → none': {
			entries: [RESIGNED],
			pages: [{ path: 'doc/api/query.md', text: QUERY_PAGE, touched: true }],
			expected: [],
		},
		"the same, the untouched page names it, another touched page holds only the route's last word → one finding":
			{
				entries: [RESIGNED],
				pages: [
					{ path: 'doc/api/query.md', text: QUERY_PAGE, touched: false },
					{ path: 'doc/guide/other.md', text: OTHER_PAGE, touched: true },
				],
				expected: [
					{
						route: 'doc.query.info.of',
						change: 'signature',
						declaredAt: 'src/info.ts:4',
						pages: ['doc/api/query.md'],
					},
				],
			},
		'an added entry no page names → one finding with no page': {
			entries: [{ path: 'doc.query.info.all', change: 'added', declaredAt: 'src/info.ts:9' }],
			pages: [{ path: 'doc/api/query.md', text: QUERY_PAGE, touched: false }],
			expected: [
				{ route: 'doc.query.info.all', change: 'added', declaredAt: 'src/info.ts:9', pages: [] },
			],
		},
		'a removed entry a page still names → one finding naming the page': {
			entries: [{ path: 'doc.query.info.of', change: 'removed' }],
			pages: [{ path: 'doc/api/query.md', text: QUERY_PAGE, touched: true }],
			expected: [{ route: 'doc.query.info.of', change: 'removed', pages: ['doc/api/query.md'] }],
		},
		'a re-signed entry no page names → none': {
			entries: [RESIGNED],
			pages: [{ path: 'doc/guide/other.md', text: OTHER_PAGE, touched: false }],
			expected: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(findDocsNotUpdated({ entries: testCase.entries, pages: testCase.pages })).toEqual(
				testCase.expected,
			)
		})
})

describe('docsGateApplies', () => {
	const testCases: Record<
		string,
		{ profile: string | undefined; tool: boolean; expected: boolean }
	> = {
		'a contributor library → judged': { profile: 'contributor', tool: false, expected: true },
		'a contributor tool → not judged (its pages are generated and checked fresh)': {
			profile: 'contributor',
			tool: true,
			expected: false,
		},
		'a consumer package → not judged': { profile: 'consumer', tool: false, expected: false },
		'no profile → not judged': { profile: undefined, tool: false, expected: false },
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(docsGateApplies({ profile: testCase.profile, tool: testCase.tool })).toBe(
				testCase.expected,
			)
		})
})
