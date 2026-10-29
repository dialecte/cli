import { findOnlyMarkers, listTestCalls } from './test-source.ts'

import { describe, expect, it } from 'vitest'

describe('findOnlyMarkers', () => {
	const CASES: Record<string, { text: string; lines: number[] }> = {
		'it.only, describe.only, test.only.each → each line': {
			text: "it.only('a', () => {})\ndescribe.only('b', () => {})\ntest.only.each([1])('c %i', () => {})\n",
			lines: [1, 2, 3],
		},
		'a table case with only: true → its line': {
			text: 'const CASES = {\n\ta: { input: 1 },\n\tb: { input: 2, only: true },\n}\n',
			lines: [3],
		},
		'only: false, a variable named only, a plain it → none': {
			text: "const only = 1\nconst row = { only: false }\nit('a', () => { expect(only).toBe(1) })\n",
			lines: [],
		},
	}
	for (const [name, testCase] of Object.entries(CASES))
		it(name, () => {
			expect(findOnlyMarkers(testCase.text)).toEqual(testCase.lines)
		})
})

describe('listTestCalls', () => {
	it('each it / test call with its written title; a computed title → undefined', () => {
		expect(
			listTestCalls(
				[
					"describe('add', () => {",
					"\tit('one', () => { expect(1).toBe(1) })",
					"\ttest.skip('two', () => {})",
					"\tit.each([1])('adds %i', (value) => { expect(value).toBe(1) })",
					'\tfor (const name of names) it(name, () => {})',
					'})',
					'',
				].join('\n'),
			).map((call) => call.title),
		).toEqual(['one', 'two', 'adds %i', undefined])
	})
})
