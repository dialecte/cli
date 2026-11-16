import { readerUnionOf } from './reader-union-of.ts'

import { describe, expect, it } from 'vitest'

type TestCase = { a: string[]; b: string[]; expected: string[] }

describe('readerUnionOf: A1, B1, A2, B2 and so on, a slice met twice kept at its first place', () => {
	const testCases: Record<string, TestCase> = {
		'a = s1 s2 s3, b = s4 s1 s5 → s1 s4 s2 s3 s5: the second s1 is dropped': {
			a: ['s1', 's2', 's3'],
			b: ['s4', 's1', 's5'],
			expected: ['s1', 's4', 's2', 's3', 's5'],
		},
		'two disjoint sides of the same length → interleaved': {
			a: ['s1', 's2'],
			b: ['s3', 's4'],
			expected: ['s1', 's3', 's2', 's4'],
		},
		'the same slices in the same order → the one list': {
			a: ['s1', 's2', 's3'],
			b: ['s1', 's2', 's3'],
			expected: ['s1', 's2', 's3'],
		},
		'b longer than a → the rest of b follows the interleaved part': {
			a: ['s1'],
			b: ['s2', 's3', 's4'],
			expected: ['s1', 's2', 's3', 's4'],
		},
		'a longer than b → the rest of a follows the interleaved part': {
			a: ['s1', 's2', 's3'],
			b: ['s4'],
			expected: ['s1', 's4', 's2', 's3'],
		},
		'the first slice of b already met in a at its third place → kept at the first place it was met':
			{
				a: ['s1', 's2', 's3'],
				b: ['s3', 's4'],
				expected: ['s1', 's3', 's2', 's4'],
			},
		'a empty → the slices of b': {
			a: [],
			b: ['s1', 's2'],
			expected: ['s1', 's2'],
		},
		'b empty → the slices of a': {
			a: ['s1', 's2'],
			b: [],
			expected: ['s1', 's2'],
		},
		'both empty → nothing': { a: [], b: [], expected: [] },
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(readerUnionOf({ a: testCase.a, b: testCase.b })).toEqual(testCase.expected)
		})
})
