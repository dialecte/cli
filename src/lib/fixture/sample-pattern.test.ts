import { patternValues, samplePattern } from './sample-pattern.ts'

import { describe, expect, it } from 'vitest'

import type { SampleResult, ValuesResult } from './fixture.types.ts'

/** A pattern as core's `valuePatterns` compiles it: anchored, with the `u` flag. */
function anchored(source: string): RegExp {
	return new RegExp(`^(?:${source})$`, 'u')
}

describe('samplePattern', () => {
	type TestCase = {
		patterns: RegExp[]
		expected: SampleResult
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'a class with a count → the first preferred character, that many times': {
			patterns: [anchored('(?:[a-z]{3})')],
			expected: { value: 'aaa' },
		},
		'a class without lower case → the first character it admits': {
			patterns: [anchored('(?:[A-Z]+)')],
			expected: { value: 'A' },
		},
		'a negated class and escaped separators → a value holding the separators': {
			patterns: [anchored('(?:[^\\n\\r]+\\/[^\\n\\r]+(?:\\/[^\\n\\r]+)*)')],
			expected: { value: 'a/a/a' },
		},
		'alternatives → the first one': {
			patterns: [anchored('(?:none)|(?:CN=[^\\n\\r]+)')],
			expected: { value: 'none' },
		},
		'two patterns → a value both match, the first one that does': {
			patterns: [anchored('(?:[0-9]{2}|[a-z]{2})'), anchored('(?:[a-z]+)')],
			expected: { value: 'aa' },
		},
		'an escape class (\\d) and a hex range → digits and letters in the order tried': {
			patterns: [anchored('\\d{2}-[0-9a-f]{4}')],
			expected: { value: '00-aaaa' },
		},
		'a range of counts → at least one repetition, never more than the most': {
			patterns: [anchored('[A-Za-z][0-9A-Z_a-z]{0,2}')],
			expected: { value: 'aa' },
		},
		'an optional part → present once': {
			patterns: [anchored('a(?:b)?c')],
			expected: { value: 'abc' },
		},
		'a lookahead → the construct named, no value': {
			patterns: [anchored('(?=a)a')],
			expected: { problem: 'pattern ^(?:(?=a)a)$ uses (?=, which the fixture cannot sample' },
		},
		'a back reference → the construct named, no value': {
			patterns: [anchored('(a)\\1')],
			expected: { problem: 'pattern ^(?:(a)\\1)$ uses \\1, which the fixture cannot sample' },
		},
		'patterns no sample satisfies together → said so': {
			patterns: [anchored('[a-z]+'), anchored('[0-9]+')],
			expected: {
				problem: 'no sample matches every pattern (^(?:[a-z]+)$, ^(?:[0-9]+)$)',
			},
		},
	}

	const entries = Object.entries(testCases)
	const focused = entries.filter(([, testCase]) => testCase.only)
	for (const [description, testCase] of focused.length ? focused : entries)
		it(description, () => {
			expect(samplePattern({ patterns: testCase.patterns })).toEqual(testCase.expected)
		})
})

describe('patternValues', () => {
	type TestCase = {
		patterns: RegExp[]
		limit: number
		accepts?: (value: string) => boolean
		expected: ValuesResult
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'several values → distinct, the last character counting up': {
			patterns: [anchored('[a-z]{3}')],
			limit: 3,
			expected: { values: ['aaa', 'aab', 'aac'] },
		},
		'a length the shortest strings miss → the repeated part stretched to it': {
			patterns: [anchored('L[A-Z]*')],
			limit: 1,
			accepts: (value) => value.length === 4,
			expected: { values: ['LAAA'] },
		},
		'a length the pattern never reaches → none': {
			patterns: [anchored('[a-z]{2}')],
			limit: 1,
			accepts: (value) => value.length === 4,
			expected: { values: [] },
		},
	}

	const entries = Object.entries(testCases)
	const focused = entries.filter(([, testCase]) => testCase.only)
	for (const [description, testCase] of focused.length ? focused : entries)
		it(description, () => {
			expect(
				patternValues({
					patterns: testCase.patterns,
					limit: testCase.limit,
					accepts: testCase.accepts,
				}),
			).toEqual(testCase.expected)
		})
})
