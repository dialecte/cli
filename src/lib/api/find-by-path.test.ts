import { findByPath } from './find-by-path.ts'

import { describe, expect, it } from 'vitest'

import type { ApiJson, ApiRootMethod } from './api-json.types.ts'

function method(params: Partial<ApiRootMethod> & { path: string }): ApiRootMethod {
	return {
		root: 'q',
		otherRoutes: [],
		signature: '() => void',
		summary: undefined,
		intents: [],
		declaredAt: undefined,
		example: undefined,
		...params,
	}
}

const INDEXES: ApiJson[] = [
	{
		package: '@dialecte/core',
		methods: [method({ path: 'doc.query.perf.report', otherRoutes: ['doc.perf.report'] })],
	},
	{
		package: '@dialecte/scl',
		methods: [
			method({ path: 'doc.query.info.of' }),
			method({ path: 'doc.query.info.ofEach' }),
			method({ path: 'tx.reference.applyUuidRemap', root: 'tx' }),
			method({ path: 'doc.query.labels.of' }),
		],
	},
]

const testCases: { description: string; path: string; expected: string[] }[] = [
	{
		description: 'the whole route → that method',
		path: 'doc.query.info.of',
		expected: ['doc.query.info.of'],
	},
	{
		description: 'q. for doc.query. → the same method',
		path: 'q.info.of',
		expected: ['doc.query.info.of'],
	},
	{
		description: 'another route of the method → the method',
		path: 'doc.perf.report',
		expected: ['doc.query.perf.report'],
	},
	{
		description: 'the end of a route, not a prefix of a word → that method only',
		path: 'info.of',
		expected: ['doc.query.info.of'],
	},
	{
		description: 'a name ending two routes → both',
		path: 'of',
		expected: ['doc.query.info.of', 'doc.query.labels.of'],
	},
	{ description: 'unknown → nothing', path: 'info.title', expected: [] },
]

describe('findByPath', () => {
	for (const testCase of testCases)
		it(testCase.description, () => {
			expect(
				findByPath({ indexes: INDEXES, path: testCase.path }).map((found) => found.method.path),
			).toEqual(testCase.expected)
		})
})
