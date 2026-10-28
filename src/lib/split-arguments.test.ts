import { splitArguments } from './split-arguments.ts'

import { describe, expect, it } from 'vitest'

import type { SplitArguments } from './split-arguments.types.ts'

describe('splitArguments', () => {
	type TestCase = { argv: string[]; expected: SplitArguments | string; only?: boolean }

	const testCases: Record<string, TestCase> = {
		'positionals, a value and a flag → each in its place': {
			argv: ['Tag', '--out', 'file.xml', '--json'],
			expected: {
				positionals: ['Tag'],
				values: new Map([['out', 'file.xml']]),
				flags: new Set(['json']),
			},
		},
		'an option nobody declares → named': {
			argv: ['--nope'],
			expected: 'unknown option --nope',
		},
		'a value option followed by another option → its value missing': {
			argv: ['--out', '--json'],
			expected: '--out needs a value',
		},
		'a value option last → its value missing': {
			argv: ['--out'],
			expected: '--out needs a value',
		},
	}

	const entries = Object.entries(testCases)
	const focused = entries.filter(([, testCase]) => testCase.only)
	for (const [description, testCase] of focused.length ? focused : entries)
		it(description, () => {
			expect(
				splitArguments({
					argv: testCase.argv,
					valueFlags: new Set(['out']),
					booleanFlags: new Set(['json']),
				}),
			).toEqual(testCase.expected)
		})
})
