import { checkCodeRules } from './check-code-rules.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

import type { RuleFinding } from './check-code-rules.types.ts'

type TestCase = {
	lines: string[]
	/** The names of the file's classes a package entry exports. */
	entryClasses?: string[]
	expected: Pick<RuleFinding, 'rule' | 'line' | 'functionLine'>[]
	only?: boolean
}

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

function positionsOf(testCase: { lines: string[]; entryClasses?: string[] }): TestCase['expected'] {
	return checkCodeRules({
		file: 'src/lib/read-things.ts',
		text: moduleOf(testCase.lines),
		referencePatterns: GENERIC_REFERENCE_PATTERNS,
		...(testCase.entryClasses && { entryClasses: new Set(testCase.entryClasses) }),
	})
		.filter((finding) => finding.rule === 'class' || finding.rule === 'argument-mutation')
		.map((finding) => ({
			rule: finding.rule,
			line: finding.line,
			functionLine: finding.functionLine,
		}))
}

describe('checkCodeRules: the class rule admits declarations, not names', () => {
	const testCases: Record<string, TestCase> = {
		'a local class named as an exported one → refused, its writes found; the exported one kept': {
			lines: [
				'export class Counter {',
				'\tinc() {',
				'\t\tthis.n++',
				'\t}',
				'}',
				'export function make() {',
				'\treturn class Counter {',
				'\t\tinc() {',
				'\t\t\tthis.n++',
				'\t\t}',
				'\t}',
				'}',
			],
			entryClasses: ['Counter'],
			expected: [
				{ rule: 'class', line: 7, functionLine: 7 },
				{ rule: 'argument-mutation', line: 9, functionLine: 8 },
			],
		},
		'an inner anonymous class beside an exported default class → refused, its writes found': {
			lines: [
				'export default class {}',
				'export const MAKERS = [',
				'\tclass {',
				'\t\tset() {',
				'\t\t\tthis.b = 1',
				'\t\t}',
				'\t},',
				']',
			],
			entryClasses: ['default'],
			expected: [
				{ rule: 'class', line: 3, functionLine: 3 },
				{ rule: 'argument-mutation', line: 5, functionLine: 4 },
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(positionsOf(testCase)).toEqual(testCase.expected)
		})
})

describe('checkCodeRules: a data-only error holds no function value', () => {
	const testCases: Record<string, TestCase> = {
		'a field holding an object with a method → refused': {
			lines: ['class Refusal extends Error {', '\thooks = { run() {} }', '}'],
			expected: [{ rule: 'class', line: 1, functionLine: 1 }],
		},
		'a field assigned a bound function, or any call → refused': {
			lines: [
				'class Refusal extends Error {',
				'\tconstructor() {',
				"\t\tsuper('refused')",
				'\t\tthis.run = report.bind(null)',
				'\t}',
				'}',
			],
			expected: [{ rule: 'class', line: 1, functionLine: 1 }],
		},
		'a field assigned a parameter typed as a function → refused': {
			lines: [
				'class Refusal extends Error {',
				'\treadonly retry: () => void',
				'\tconstructor(retry: () => void) {',
				"\t\tsuper('refused')",
				'\t\tthis.retry = retry',
				'\t}',
				'}',
			],
			expected: [{ rule: 'class', line: 1, functionLine: 1 }],
		},
		'a field assigned a local holding a function, or a module function → refused': {
			lines: [
				'function retryLater() {}',
				'class Refusal extends Error {',
				'\tconstructor() {',
				"\t\tsuper('refused')",
				'\t\tconst retry = retryLater',
				'\t\tthis.retry = retry',
				'\t}',
				'}',
			],
			expected: [{ rule: 'class', line: 2, functionLine: 2 }],
		},
		'a field assigned an imported name → refused: what it holds cannot be told here': {
			lines: [
				"import { DEFAULT_REASON } from './refusal.constants.ts'",
				'class Refusal extends Error {',
				'\tconstructor() {',
				"\t\tsuper('refused')",
				'\t\tthis.reason = DEFAULT_REASON',
				'\t}',
				'}',
			],
			expected: [{ rule: 'class', line: 2, functionLine: 2 }],
		},
		'fields taken from typed parameters, destructured, in a template or a literal → data-only, no finding':
			{
				lines: [
					'class Refusal extends Error {',
					"\toverride name = 'Refusal'",
					'\treadonly codes: readonly string[]',
					'\treadonly reason: string',
					'\tconstructor(params: { codes: readonly string[]; reason: string }) {',
					'\t\tconst { codes, reason } = params',
					'\t\tsuper(`refused: ${reason}`)',
					'\t\tthis.codes = codes',
					'\t\tthis.reason = `${reason} (${codes.length})`',
					'\t}',
					'}',
				],
				expected: [],
			},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(positionsOf(testCase)).toEqual(testCase.expected)
		})
})

describe('checkCodeRules: writes through destructuring and aliases of this', () => {
	const testCases: Record<string, TestCase> = {
		'a refused class: this written through array and object destructuring → each reported': {
			lines: [
				'class Pair {',
				'\tload(pair: number[], named: { b: number }) {',
				'\t\t;[this.a] = pair',
				'\t\t;({ b: this.b } = named)',
				'\t}',
				'}',
			],
			expected: [
				{ rule: 'class', line: 1, functionLine: 1 },
				{ rule: 'argument-mutation', line: 3, functionLine: 2 },
				{ rule: 'argument-mutation', line: 4, functionLine: 2 },
			],
		},
		'a refused class: writes through an alias of this or of a field of it → each reported': {
			lines: [
				'class Tally {',
				'\tadd() {',
				'\t\tconst self = this',
				'\t\tself.count++',
				'\t\tconst { items } = this',
				'\t\titems.push(1)',
				'\t}',
				'}',
			],
			expected: [
				{ rule: 'class', line: 1, functionLine: 1 },
				{ rule: 'argument-mutation', line: 4, functionLine: 2 },
				{ rule: 'argument-mutation', line: 6, functionLine: 2 },
			],
		},
		'a refused class: an alias of this the constructor makes, written in a function it creates → reported; written in the constructor → not':
			{
				lines: [
					'class Ticker {',
					'\tconstructor() {',
					'\t\tconst self = this',
					'\t\tself.count = 0',
					'\t\tthis.onTick = function () {',
					'\t\t\tself.count++',
					'\t\t}',
					'\t}',
					'}',
				],
				expected: [
					{ rule: 'class', line: 1, functionLine: 1 },
					{ rule: 'argument-mutation', line: 6, functionLine: 2 },
				],
			},
		'a function writing its parameter through destructuring → an argument-mutation finding': {
			lines: [
				'export function fill(params: { state: { a: number } }) {',
				'\t;({ a: params.state.a } = { a: 1 })',
				'}',
			],
			expected: [{ rule: 'argument-mutation', line: 2, functionLine: 1 }],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(positionsOf(testCase)).toEqual(testCase.expected)
		})
})
