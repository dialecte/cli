import { checkCodeRules } from './check-code-rules.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

import type { RuleFinding } from './check-code-rules.types.ts'

const QUERY_NAMES: ReadonlySet<string> = new Set([
	'getDefinition',
	'getRecord',
	'getRecords',
	'getAttributes',
])

type TestCase = {
	lines: string[]
	/** The lines of the expected findings, in order. */
	expected: number[]
	/** No finding of its own: the control function is appended, and its loop is the only finding expected. */
	controlled?: boolean
	only?: boolean
}

type MessageCase = {
	lines: string[]
	expected: { line: number; message: string }[]
	only?: boolean
}

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

/** A last function with the one flagged loop every controlled case expects, whatever else it holds. */
const CONTROL_LINES = [
	'export async function control(nodes: Node[], query: Query) {',
	'\tfor (const node of nodes) await query.getRecord(node)',
	'}',
]

/** An exported async function whose body is `body`, one statement per line from line 2. */
function inFunction(body: string[]): string[] {
	return ['export async function run(nodes: Node[], query: Query) {', ...body, '}']
}

function queryFindingsOf(params: {
	lines: string[]
	queryNames?: ReadonlySet<string>
}): RuleFinding[] {
	return checkCodeRules({
		file: 'src/lib/read-things.ts',
		text: moduleOf(params.lines),
		referencePatterns: GENERIC_REFERENCE_PATTERNS,
		queryNames: params.queryNames,
	}).filter((finding) => finding.rule === 'query-in-loop')
}

function linesOf(lines: string[]): number[] {
	return queryFindingsOf({ lines, queryNames: QUERY_NAMES }).map((finding) => finding.line)
}

describe('checkCodeRules quality: query-in-loop message', () => {
	const messageCases: Record<string, MessageCase> = {
		'a query awaited in a for-of body → the method and the iterated list are named': {
			lines: inFunction(['\tfor (const node of nodes) await query.getDefinition(node)']),
			expected: [
				{
					line: 2,
					message:
						'`getDefinition` called once per `nodes` item: read them in one query before the loop',
				},
			],
		},
		'a query in a for-in body → the iterated expression is named': {
			lines: inFunction(['\tfor (const key in params.nodes) query.getRecord(key)']),
			expected: [
				{
					line: 2,
					message:
						'`getRecord` called once per `params.nodes` item: read them in one query before the loop',
				},
			],
		},
		'a query in a map callback → the receiver of map is named': {
			lines: inFunction(['\treturn nodes.map((node) => query.getRecord(node))']),
			expected: [
				{
					line: 2,
					message:
						'`getRecord` called once per `nodes` item: read them in one query before the loop',
				},
			],
		},
		'a read in a callback at the end of a multi-line chain → the root name path is named, on one line':
			{
				lines: inFunction([
					'\treturn params.ids',
					'\t\t.filter((id) => id)',
					'\t\t.map(async function read(id) { return query.getRecord(id) })',
				]),
				expected: [
					{
						line: 4,
						message:
							'`getRecord` called once per `params.ids` item: read them in one query before the loop',
					},
				],
			},
		'a for-of inside a for-of → the inner loop is the one named': {
			lines: inFunction([
				'\tfor (const node of nodes) {',
				'\t\tfor (const child of node.children) await query.getRecord(child)',
				'\t}',
			]),
			expected: [
				{
					line: 3,
					message:
						'`getRecord` called once per `node.children` item: read them in one query before the loop',
				},
			],
		},
	}

	for (const [title, messageCase] of Object.entries(messageCases))
		(messageCase.only ? it.only : it)(title, () => {
			expect(
				queryFindingsOf({
					lines: messageCase.lines,
					queryNames: QUERY_NAMES,
				}).map((finding) => ({
					line: finding.line,
					severity: finding.severity,
					message: finding.message,
				})),
			).toEqual(
				messageCase.expected.map((expected) => ({
					...expected,
					severity: 'error',
				})),
			)
		})
})

describe('checkCodeRules quality: query-in-loop', () => {
	const testCases: Record<string, TestCase> = {
		'a for statement → one finding at the call': {
			lines: inFunction([
				'\tfor (let index = 0; index < nodes.length; index++) {',
				'\t\tawait query.getRecord(nodes[index])',
				'\t}',
			]),
			expected: [3],
		},
		'a for statement without header parts → one finding': {
			lines: inFunction(['\tfor (;;) {', '\t\tawait query.getRecord(nodes[0])', '\t}']),
			expected: [3],
		},
		'a for-in statement → one finding': {
			lines: inFunction(['\tfor (const key in nodes) {', '\t\tawait query.getRecord(key)', '\t}']),
			expected: [3],
		},
		'a while statement → one finding': {
			lines: inFunction([
				'\twhile (nodes.length > 0) {',
				'\t\tawait query.getRecord(nodes.pop())',
				'\t}',
			]),
			expected: [3],
		},
		'a do-while statement → one finding': {
			lines: inFunction([
				'\tdo {',
				'\t\tawait query.getRecord(nodes.pop())',
				'\t} while (nodes.length > 0)',
			]),
			expected: [3],
		},
		'a forEach callback → one finding': {
			lines: inFunction(['\tnodes.forEach((node) => {', '\t\tquery.getRecord(node)', '\t})']),
			expected: [3],
		},
		'a flatMap callback → one finding': {
			lines: inFunction(['\treturn nodes.flatMap((node) => query.getRecords(node))']),
			expected: [2],
		},
		'a filter callback → one finding': {
			lines: inFunction(['\treturn nodes.filter((node) => query.getRecord(node))']),
			expected: [2],
		},
		'a reduce callback → one finding': {
			lines: inFunction([
				'\treturn nodes.reduce((count, node) => count + query.getAttributes(node).length, 0)',
			]),
			expected: [2],
		},
		'a some callback → one finding': {
			lines: inFunction(['\treturn nodes.some((node) => query.getRecord(node))']),
			expected: [2],
		},
		'an every callback → one finding': {
			lines: inFunction(['\treturn nodes.every((node) => query.getRecord(node))']),
			expected: [2],
		},
		'a find callback → one finding': {
			lines: inFunction(['\treturn nodes.find((node) => query.getRecord(node))']),
			expected: [2],
		},
		'a findIndex callback → one finding': {
			lines: inFunction(['\treturn nodes.findIndex((node) => query.getRecord(node))']),
			expected: [2],
		},
		'a function expression inside Promise.all over map → one finding': {
			lines: inFunction([
				'\tawait Promise.all(nodes.map(async function read(node) {',
				'\t\treturn query.getRecord(node)',
				'\t}))',
			]),
			expected: [3],
		},
		'a tx receiver → one finding': {
			lines: [
				'export function run(nodes: Node[], tx: Tx) {',
				'\tfor (const node of nodes) tx.getRecord(node)',
				'}',
			],
			expected: [2],
		},
		'a transaction receiver → one finding': {
			lines: [
				'export function run(nodes: Node[], transaction: Tx) {',
				'\tfor (const node of nodes) transaction.getRecord(node)',
				'}',
			],
			expected: [2],
		},
		'a receiver ending in Query → one finding': {
			lines: [
				'export function run(nodes: Node[], sourceQuery: Query) {',
				'\tfor (const node of nodes) sourceQuery.getRecord(node)',
				'}',
			],
			expected: [2],
		},
		'a receiver ending in Tx → one finding': {
			lines: [
				'export function run(nodes: Node[], targetTx: Tx) {',
				'\tfor (const node of nodes) targetTx.getRecord(node)',
				'}',
			],
			expected: [2],
		},
		'a path through .query and .any → one finding': {
			lines: [
				'export function run(nodes: Node[], context: Context) {',
				'\tfor (const node of nodes) context.query.any.getAttributes(node)',
				'}',
			],
			expected: [2],
		},
		'a path through .any on a transaction → one finding': {
			lines: inFunction(['\tfor (const node of nodes) tx.any.getRecord(node)']),
			expected: [2],
		},
		'a path through .query and a namespace → one finding': {
			lines: [
				'export function run(nodes: Node[], doc: Doc) {',
				'\tfor (const node of nodes) doc.query.ns.getRecords(node)',
				'}',
			],
			expected: [2],
		},
		'two calls of one method in one loop → one finding, at the first': {
			lines: inFunction([
				'\tfor (const node of nodes) {',
				'\t\tawait query.getRecord(node)',
				'\t\tawait query.getRecord(node.parent)',
				'\t}',
			]),
			expected: [3],
		},
		'two methods in one loop → one finding each': {
			lines: inFunction([
				'\tfor (const node of nodes) {',
				'\t\tawait query.getRecord(node)',
				'\t\tawait query.getDefinition(node)',
				'\t}',
			]),
			expected: [3, 4],
		},
		'a while inside a for with the call in the while → one finding': {
			lines: inFunction([
				'\tfor (const node of nodes) {',
				'\t\twhile (node.parent) {',
				'\t\t\tawait query.getRecord(node.parent)',
				'\t\t}',
				'\t}',
			]),
			expected: [4],
		},
		'a for with a direct call and a while with another → one finding each': {
			lines: inFunction([
				'\tfor (const node of nodes) {',
				'\t\tawait query.getRecord(node)',
				'\t\twhile (node.parent) {',
				'\t\t\tawait query.getRecord(node.parent)',
				'\t\t}',
				'\t}',
			]),
			expected: [3, 5],
		},
		'two sibling loops each calling the query → one finding each': {
			lines: inFunction([
				'\tfor (const node of nodes) await query.getRecord(node)',
				'\tfor (const node of nodes) await query.getRecord(node.parent)',
			]),
			expected: [2, 3],
		},
		'a callback defined in a loop body and called later → one finding': {
			lines: inFunction([
				'\tconst readers = []',
				'\tfor (const node of nodes) {',
				'\t\treaders.push(() => query.getRecord(node))',
				'\t}',
				'\treturn readers',
			]),
			expected: [4],
		},
		'a query on a cache object → no finding': {
			lines: [
				'export function run(nodes: Node[], cache: Cache) {',
				'\tfor (const node of nodes) cache.getRecord(node)',
				'}',
			],
			expected: [],
			controlled: true,
		},
		'console.log in a loop → no finding': {
			lines: inFunction(['\tfor (const node of nodes) console.log(node)']),
			expected: [],
			controlled: true,
		},
		'a delete on a map in a loop → no finding': {
			lines: [
				'export function run(keys: string[], map: Map<string, string>) {',
				'\tfor (const key of keys) map.delete(key)',
				'}',
			],
			expected: [],
			controlled: true,
		},
		'an update on a hash in a loop → no finding': {
			lines: [
				'export function run(parts: string[], hash: Hash) {',
				'\tfor (const part of parts) hash.update(part)',
				'}',
			],
			expected: [],
			controlled: true,
		},
		'a method of no query name behind a query path → no finding': {
			lines: [
				'export function run(nodes: Node[], doc: Doc) {',
				'\tfor (const node of nodes) doc.query.perf.count()',
				'}',
			],
			expected: [],
			controlled: true,
		},
		'a query read name behind a perf segment → no finding': {
			lines: [
				'export function run(nodes: Node[], doc: Doc) {',
				'\tfor (const node of nodes) doc.query.perf.getRecord()',
				'}',
			],
			expected: [],
			controlled: true,
		},
		'a write on a transaction in a loop → no finding': {
			lines: inFunction(['\tfor (const node of nodes) tx.update(node)']),
			expected: [],
			controlled: true,
		},
		'a query before the loop on the whole list → no finding': {
			lines: inFunction([
				'\tconst records = await query.getRecords(nodes)',
				'\tfor (const record of records) use(record)',
			]),
			expected: [],
			controlled: true,
		},
		'a query in the iterated expression of a for-of → no finding': {
			lines: inFunction(['\tfor (const record of await query.getRecords(nodes)) use(record)']),
			expected: [],
			controlled: true,
		},
		'a query as the receiver of map → no finding': {
			lines: inFunction([
				'\treturn query.getRecords(nodes).map(function idOf(record) { return record.id })',
			]),
			expected: [],
			controlled: true,
		},
		'a then callback outside any loop → no finding': {
			lines: inFunction([
				'\treturn promise.then(function read(node) { return query.getRecord(node) })',
			]),
			expected: [],
			controlled: true,
		},
		'a receiver only containing Query in its name → no finding': {
			lines: inFunction(['\tfor (const node of nodes) queryCache.getRecord(node)']),
			expected: [],
			controlled: true,
		},
		'a function passed by name to map → no finding': {
			lines: [
				'async function toLabel(node: Node, query: Query) {',
				'\treturn query.getRecord(node)',
				'}',
				'export function run(nodes: Node[]) {',
				'\treturn nodes.map(toLabel)',
				'}',
			],
			expected: [],
			controlled: true,
		},
	}

	const flaggedCases = Object.entries(testCases).filter(([, testCase]) => !testCase.controlled)
	const controlledCases = Object.entries(testCases).filter(([, testCase]) => testCase.controlled)

	for (const [title, testCase] of flaggedCases)
		(testCase.only ? it.only : it)(title, () => {
			expect(linesOf(testCase.lines)).toEqual(testCase.expected)
		})

	for (const [title, testCase] of controlledCases)
		(testCase.only ? it.only : it)(title, () => {
			expect(linesOf([...testCase.lines, ...CONTROL_LINES])).toEqual([testCase.lines.length + 2])
		})

	const fixture = inFunction(['\tfor (const node of nodes) await query.getDefinition(node)'])

	it('the loop flagged with the names, no query names given → no query-in-loop finding', () => {
		expect(queryFindingsOf({ lines: fixture, queryNames: QUERY_NAMES })).toHaveLength(1)
		expect(queryFindingsOf({ lines: fixture })).toEqual([])
	})

	it('the loop flagged with the names, an empty set of query names → no query-in-loop finding', () => {
		expect(queryFindingsOf({ lines: fixture, queryNames: QUERY_NAMES })).toHaveLength(1)
		expect(queryFindingsOf({ lines: fixture, queryNames: new Set() })).toEqual([])
	})
})
