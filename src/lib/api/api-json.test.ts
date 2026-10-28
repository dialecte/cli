import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { buildApiJson, renderApiJson } from './api-json.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MethodEntry } from '../discover.types.ts'

let root: string

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

const OF_SOURCE = [
	"import type { Query } from 'engine'",
	'',
	'/** Title of an element. */',
	'export function of(query: Query, ref: string): string {',
	'	return ref',
	'}',
	'',
].join('\n')

/** `file:position` of `export function of`, as discover writes it. */
const OF_DECLARED_AT = `src/info/of.ts:${OF_SOURCE.indexOf('export function of')}`

function entry(params: Partial<MethodEntry> & { path: string }): MethodEntry {
	return {
		summary: 'Title of an element.',
		intents: ['label of an element'],
		signature: '(ref: string) => string',
		example: undefined,
		definedInPackage: true,
		internal: false,
		declaredAt: OF_DECLARED_AT,
		...params,
	}
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-api-json-'))
	write('src/info/of.ts', OF_SOURCE)
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

type TestCase = {
	description: string
	testFile?: string
	methods: MethodEntry[]
	expected: ApiJsonExpectation
}

type ApiJsonExpectation = ReturnType<typeof buildApiJson>['methods']

const testCases: TestCase[] = [
	{
		description:
			'a method on q and tx, a core method → one entry on doc.query, tx route dropped, line of the declaration',
		methods: [
			entry({ path: 'q.info.of' }),
			entry({ path: 'tx.info.of' }),
			entry({ path: 'doc.info.of' }),
			entry({ path: 'q.getTree', definedInPackage: false, declaredAt: 'core:1' }),
		],
		expected: [
			{
				path: 'doc.query.info.of',
				root: 'q',
				otherRoutes: ['doc.info.of'],
				signature: '(ref: string) => string',
				summary: 'Title of an element.',
				intents: ['label of an element'],
				declaredAt: 'src/info/of.ts:4',
				example: undefined,
			},
		],
	},
	{
		description:
			'test calls with literal and with variable arguments → the literal one, on the route, the query argument dropped',
		testFile: [
			"import { of } from './of'",
			"it('a', async () => {",
			'	expect(of(source.query, bay)).toBe(1)',
			"	expect(of(source.query, { tagName: 'Bay', id: 'b1' })).toBe(1)",
			'})',
			'',
		].join('\n'),
		methods: [entry({ path: 'q.info.of' })],
		expected: [
			expect.objectContaining({ example: "doc.query.info.of({ tagName: 'Bay', id: 'b1' })" }),
		] as ApiJsonExpectation,
	},
	{
		description:
			'test calls holding only scaffolding (testCase., REFS., casts, a multi-line object) → no example',
		testFile: [
			"it('a', async () => {",
			'	of(source.query, testCase.ref)',
			'	of(source.query, REFS.bay)',
			'	of(source.query, ref as never)',
			'	of(source.query, <Ref>ref)',
			'	of(source.query, {',
			"		mode: 'long',",
			'	})',
			'})',
			'',
		].join('\n'),
		methods: [entry({ path: 'q.info.of' })],
		expected: [expect.objectContaining({ example: undefined })] as ApiJsonExpectation,
	},
	{
		description: 'a string argument holding several spaces → written as it is',
		testFile: "it('a', () => of(source.query, 'a  b,  }'))\n",
		methods: [entry({ path: 'q.info.of' })],
		expected: [
			expect.objectContaining({ example: "doc.query.info.of('a  b,  }')" }),
		] as ApiJsonExpectation,
	},
	{
		description: 'a JSDoc @example calling the route and a test call → the JSDoc example',
		testFile: "it('a', () => of(source.query, 'x'))\n",
		methods: [entry({ path: 'q.info.of', example: 'await doc.query.info.of(bay)' })],
		expected: [
			expect.objectContaining({ example: 'await doc.query.info.of(bay)' }),
		] as ApiJsonExpectation,
	},
	{
		description: 'a JSDoc @example that never calls the method → the test call instead',
		testFile: "it('a', () => of(source.query, 'x'))\n",
		methods: [entry({ path: 'q.info.of', example: 'const title = labels.get(bay)' })],
		expected: [
			expect.objectContaining({ example: "doc.query.info.of('x')" }),
		] as ApiJsonExpectation,
	},
	{
		description:
			'a JSDoc @example calling the function bare, not on a route → the test call instead',
		testFile: "it('a', () => of(source.query, 'x'))\n",
		methods: [entry({ path: 'q.info.of', example: "of(source.query, 'y')" })],
		expected: [
			expect.objectContaining({ example: "doc.query.info.of('x')" }),
		] as ApiJsonExpectation,
	},
	{
		description: 'a JSDoc @example longer than an example → the test call instead',
		testFile: "it('a', () => of(source.query, 'x'))\n",
		methods: [
			entry({
				path: 'q.info.of',
				example: `await doc.query.info.of(bay)\n${'// more\n'.repeat(30)}`,
			}),
		],
		expected: [
			expect.objectContaining({ example: "doc.query.info.of('x')" }),
		] as ApiJsonExpectation,
	},
	{
		description: 'an awaited test call → the example keeps the await',
		testFile: "it('a', async () => { await of(source.query, 'x') })\n",
		methods: [entry({ path: 'q.info.of' })],
		expected: [
			expect.objectContaining({ example: "await doc.query.info.of('x')" }),
		] as ApiJsonExpectation,
	},
]

describe('buildApiJson', () => {
	for (const testCase of testCases)
		it(testCase.description, () => {
			if (testCase.testFile) write('src/info/of.test.ts', testCase.testFile)
			expect(
				buildApiJson({ packageName: '@acme/widget', methods: testCase.methods, root }),
			).toEqual({ package: '@acme/widget', methods: testCase.expected })
		})

	it('same methods in another order, twice → byte-identical file', () => {
		write('src/info/title.ts', OF_SOURCE.replace('function of', 'function title'))
		const methods = [
			entry({ path: 'q.info.of' }),
			entry({
				path: 'q.info.title',
				declaredAt: `src/info/title.ts:${OF_SOURCE.indexOf('export function of')}`,
			}),
		]
		const first = renderApiJson(buildApiJson({ packageName: 'p', methods, root }))
		const second = renderApiJson(
			buildApiJson({ packageName: 'p', methods: [...methods].reverse(), root }),
		)
		expect(second).toBe(first)
		expect(JSON.parse(first).methods.map((method: { path: string }) => method.path)).toEqual([
			'doc.query.info.of',
			'doc.query.info.title',
		])
	})
})
