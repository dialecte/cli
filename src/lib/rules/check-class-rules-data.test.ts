import { checkCodeRules } from './check-code-rules.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

import type { RuleFinding } from './check-code-rules.types.ts'

type TestCase = {
	lines: string[]
	expected: Pick<RuleFinding, 'rule' | 'line' | 'functionLine'>[]
	only?: boolean
}

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

function positionsOf(lines: string[]): TestCase['expected'] {
	return checkCodeRules({
		file: 'src/lib/read-things.ts',
		text: moduleOf(lines),
		referencePatterns: GENERIC_REFERENCE_PATTERNS,
	})
		.filter((finding) => finding.rule === 'class' || finding.rule === 'argument-mutation')
		.map((finding) => ({
			rule: finding.rule,
			line: finding.line,
			functionLine: finding.functionLine,
		}))
}

describe('checkCodeRules: what a data-only error may hold', () => {
	const testCases: Record<string, TestCase> = {
		'a name from new.target, a global, an unannotated parameter → data-only, no finding': {
			lines: [
				'class Refusal extends Error {',
				'\tconstructor(detail, code = 7) {',
				"\t\tsuper('refused')",
				'\t\tthis.name = new.target.name',
				'\t\tthis.limit = Infinity',
				'\t\tthis.detail = detail',
				'\t\tthis.code = code',
				'\t}',
				'}',
			],
			expected: [],
		},
		'a parameter whose default is a function, assigned to a field → refused': {
			lines: [
				'class Refusal extends Error {',
				'\tconstructor(retry = () => {}) {',
				"\t\tsuper('refused')",
				'\t\tthis.retry = retry',
				'\t}',
				'}',
			],
			expected: [{ rule: 'class', line: 1, functionLine: 1 }],
		},
		'Object.setPrototypeOf(this, …) in the constructor → the one call admitted': {
			lines: [
				'class Refusal extends Error {',
				'\tconstructor() {',
				"\t\tsuper('refused')",
				'\t\tObject.setPrototypeOf(this, Refusal.prototype)',
				'\t}',
				'}',
			],
			expected: [],
		},
		'another call in the constructor, Object.freeze(this) → refused': {
			lines: [
				'class Refusal extends Error {',
				'\tconstructor() {',
				"\t\tsuper('refused')",
				'\t\tObject.freeze(this)',
				'\t}',
				'}',
			],
			expected: [{ rule: 'class', line: 1, functionLine: 1 }],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(positionsOf(testCase.lines)).toEqual(testCase.expected)
		})
})

describe('checkCodeRules: an alias of this is scoped', () => {
	const testCases: Record<string, TestCase> = {
		'a callback parameter or an inner const shadowing the alias → not a write through this (the callback changing its own argument stays its own finding)':
			{
				lines: [
					'class Tally {',
					'\tadd(items: { x: number }[], other: { x: number }) {',
					'\t\tconst self = this',
					'\t\titems.forEach((self) => {',
					'\t\t\tself.x = 1',
					'\t\t})',
					'\t\t{',
					'\t\t\tconst self = other',
					'\t\t\tself.x = 2',
					'\t\t}',
					'\t}',
					'}',
				],
				expected: [
					{ rule: 'class', line: 1, functionLine: 1 },
					// the callback changes its own argument, never the instance: owned by the callback (line 4)
					{ rule: 'argument-mutation', line: 5, functionLine: 4 },
				],
			},
		'the alias written after an inner block that shadowed it → reported': {
			lines: [
				'class Tally {',
				'\tadd(other: { x: number }) {',
				'\t\tconst self = this',
				'\t\t{',
				'\t\t\tconst self = other',
				'\t\t}',
				'\t\tself.count = 1',
				'\t}',
				'}',
			],
			expected: [
				{ rule: 'class', line: 1, functionLine: 1 },
				{ rule: 'argument-mutation', line: 7, functionLine: 2 },
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(positionsOf(testCase.lines)).toEqual(testCase.expected)
		})
})

describe('checkCodeRules: destructuring that writes no instance nor parameter', () => {
	const testCases: Record<string, TestCase> = {
		'local destructuring, a swap and for-of heads in a refused class → only the class finding': {
			lines: [
				'class Pairs {',
				'\tswap(pairs: number[][], o: { a: number }) {',
				'\t\tlet a = 0',
				'\t\tlet b = 1',
				'\t\t;({ a } = o)',
				'\t\t;[a, b] = [b, a]',
				'\t\tfor ([a, b] of pairs) b = a',
				'\t\tfor (a of [1]) b = a',
				'\t}',
				'}',
			],
			expected: [{ rule: 'class', line: 1, functionLine: 1 }],
		},
		'the same in a plain function → nothing': {
			lines: [
				'export function swap(params: { pairs: number[][]; o: { a: number } }) {',
				'\tlet a = 0',
				'\tlet b = 1',
				'\t;({ a } = params.o)',
				'\t;[a, b] = [b, a]',
				'\tfor ([a, b] of params.pairs) b = a',
				'}',
			],
			expected: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(positionsOf(testCase.lines)).toEqual(testCase.expected)
		})
})
