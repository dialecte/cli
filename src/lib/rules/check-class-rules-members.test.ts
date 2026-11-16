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

describe('checkCodeRules: the class rule on fields, decorators and data-only errors', () => {
	const testCases: Record<string, TestCase> = {
		'a refused class: an arrow a field initializer creates, wrapped in a call, an object or parentheses → each reported under its field':
			{
				lines: [
					'class Panel {',
					'\tonClick = debounce(() => {',
					'\t\tthis.count++',
					'\t})',
					'\thandlers = { go: () => this.items.push(1) }',
					'\twrapped = (() => {',
					'\t\tthis.z = 1',
					'\t})',
					'}',
				],
				expected: [
					{ rule: 'class', line: 1, functionLine: 1 },
					{ rule: 'argument-mutation', line: 3, functionLine: 2 },
					{ rule: 'argument-mutation', line: 5, functionLine: 5 },
					{ rule: 'argument-mutation', line: 7, functionLine: 6 },
				],
			},
		'a refused class: a decorated method → its opt-out line is the decorator line': {
			lines: ['class Panel {', '\t@bound', '\tadd() {', '\t\tthis.count++', '\t}', '}'],
			expected: [
				{ rule: 'class', line: 1, functionLine: 1 },
				{ rule: 'argument-mutation', line: 4, functionLine: 2 },
			],
		},
		'an Error subclass whose constructor assigns a function to a field → refused, the function’s write found':
			{
				lines: [
					'class Refusal extends Error {',
					'\tconstructor() {',
					"\t\tsuper('refused')",
					'\t\tthis.retry = () => {',
					'\t\t\tthis.tries = 2',
					'\t\t}',
					'\t}',
					'}',
				],
				expected: [
					{ rule: 'class', line: 1, functionLine: 1 },
					{ rule: 'argument-mutation', line: 5, functionLine: 2 },
				],
			},
		'an Error subclass with an index signature and fields → data-only, no finding': {
			lines: [
				'class Refusal extends Error {',
				'\t[key: string]: unknown',
				"\treadonly code = 'R1'",
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
