import {
	findOnlyMarkers,
	importedNames,
	isInsideAssertion,
	listTestCalls,
	moduleSpecifiers,
	testCallTextAt,
} from './test-source.ts'

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
		'the runner idiom testCase.only ? it.only : it → none (a reference is not a call)': {
			text: "const run = testCase.only ? it.only : it\nrun('a', () => { expect(1).toBe(1) })\n",
			lines: [],
		},
		'the runner idiom next to a literal it.only( call → only the call': {
			text: "const run = testCase.only ? it.only : it\nit.only('a', () => {})\ndescribe.only('b', () => {})\n",
			lines: [2, 3],
		},
		'only: false, a variable named only, a plain it → none': {
			text: "const only = 1\nconst row = { only: false }\nit('a', () => { expect(only).toBe(1) })\n",
			lines: [],
		},
	}
	for (const [name, testCase] of Object.entries(CASES))
		it(name, () => {
			expect(findOnlyMarkers({ text: testCase.text, file: 'a.test.ts' })).toEqual(testCase.lines)
		})
})

describe('listTestCalls', () => {
	it('each it / test call with its written title; a computed title → undefined', () => {
		expect(
			listTestCalls({
				file: 'a.test.ts',
				text: [
					"describe('add', () => {",
					"\tit('one', () => { expect(1).toBe(1) })",
					"\ttest.skip('two', () => {})",
					"\tit.each([1])('adds %i', (value) => { expect(value).toBe(1) })",
					'\tfor (const name of names) it(name, () => {})',
					'})',
					'',
				].join('\n'),
			}).map((call) => call.title),
		).toEqual(['one', 'two', 'adds %i', undefined])
	})
})

describe('testCallTextAt in a .ts file', () => {
	const CALL = "it('one', () => { expect(1).toBe(1) })"

	const SOURCES: Record<string, string> = {
		'a type assertion <string>x before the call': `const value = <string>'x'\n${CALL}\n`,
		'a generic arrow <T>(v: T) => v before the call': `const identity = <T>(v: T) => v\n${CALL}\n`,
	}

	for (const [name, text] of Object.entries(SOURCES))
		it(`${name} → the call text is the test's own, the same after a format-only edit elsewhere`, () => {
			const formatted = text.replace("'x'", '"x"').replace('identity =', 'identity  =')

			expect({
				original: testCallTextAt({ text, file: 'a.test.ts', location: { line: 2, column: 1 } }),
				formatted: testCallTextAt({
					text: formatted,
					file: 'a.test.ts',
					location: { line: 2, column: 1 },
				}),
			}).toEqual({ original: CALL, formatted: CALL })
		})
})

describe('the other readers in a .ts file with a cast or a generic arrow before the construct', () => {
	const PREFIXES: Record<string, string> = {
		'a type assertion <string>x': "const value = <string>'x'\n",
		'a generic arrow <T>(v: T) => v': 'const identity = <T>(v: T) => v\n',
	}

	for (const [prefixName, prefix] of Object.entries(PREFIXES)) {
		const READERS: Record<string, (prefixed: string) => unknown> = {
			'findOnlyMarkers finds an it.only( call': (text) =>
				findOnlyMarkers({ text: `${text}it.only('a', () => {})\n`, file: 'a.test.ts' }),
			'listTestCalls finds the test calls': (text) =>
				listTestCalls({
					text: `${text}it('a', () => {})\ntest('b', () => {})\n`,
					file: 'a.test.ts',
				}).map((call) => call.title),
			'moduleSpecifiers finds an import': (text) =>
				moduleSpecifiers({ text: `${text}import { x } from './x.ts'\n`, file: 'a.test.ts' }),
			'isInsideAssertion finds an expect(...)': (text) =>
				isInsideAssertion({
					text: `${text}expect(boom()).toBe(1)\n`,
					file: 'a.test.ts',
					location: { line: 2, column: 8 },
				}),
			'importedNames finds an import': (text) => [
				...importedNames({ text: `${text}import { x } from './x.ts'\n`, file: 'a.test.ts' }),
			],
		}
		const EXPECTED: Record<string, unknown> = {
			'findOnlyMarkers finds an it.only( call': [2],
			'listTestCalls finds the test calls': ['a', 'b'],
			'moduleSpecifiers finds an import': ['./x.ts'],
			'isInsideAssertion finds an expect(...)': true,
			'importedNames finds an import': ['x'],
		}
		for (const [name, read] of Object.entries(READERS))
			it(`${prefixName} before: ${name}`, () => {
				expect(read(prefix)).toEqual(EXPECTED[name])
			})
	}
})
