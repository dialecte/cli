import {
	findOnlyMarkers,
	importedNames,
	isInsideAssertion,
	listTestCalls,
	moduleMockCalls,
	moduleSpecifiers,
	testCallTextAt,
} from './test-source.ts'

import { describe, expect, it } from 'vitest'

import type { ModuleMockCall, SourceLocation } from './tdd.types.ts'

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

	const MODIFIER_CASES: Record<
		string,
		{ text: string; calls: { title: string | undefined; each: boolean; path: unknown[] }[] }
	> = {
		'it inside describe.for(table) → its describe title a format (undefined)': {
			text: "describe.for([1])('row %i', () => { it('a', () => {}) })\n",
			calls: [{ title: 'a', each: false, path: [undefined] }],
		},
		'it inside describe.skipIf(condition) → the literal describe title': {
			text: "describe.skipIf(skipped)('skipped', () => { it('b', () => {}) })\n",
			calls: [{ title: 'b', each: false, path: ['skipped'] }],
		},
		'it inside describe.runIf(condition) → the literal describe title': {
			text: "describe.runIf(running)('running', () => { it('c', () => {}) })\n",
			calls: [{ title: 'c', each: false, path: ['running'] }],
		},
		'it.for(table) → a test call, its title a format': {
			text: "it.for([1])('adds %i', ([value]) => {})\n",
			calls: [{ title: 'adds %i', each: true, path: [] }],
		},
		'it.skipIf(condition) and test.runIf(condition) → test calls with their literal titles': {
			text: "it.skipIf(skipped)('d', () => {})\ntest.runIf(running)('e', () => {})\n",
			calls: [
				{ title: 'd', each: false, path: [] },
				{ title: 'e', each: false, path: [] },
			],
		},
	}

	for (const [name, row] of Object.entries(MODIFIER_CASES))
		it(name, () => {
			expect(
				listTestCalls({ file: 'a.test.ts', text: row.text }).map((call) => ({
					title: call.title,
					each: call.each,
					path: call.describePath,
				})),
			).toEqual(row.calls)
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

/** Where the first `marker` starts in `text`, as a 1-based line and column. */
function locationOf(params: { text: string; marker: string }): SourceLocation {
	const offset = params.text.indexOf(params.marker)
	const before = params.text.slice(0, offset).split('\n')
	return { line: before.length, column: (before.at(-1) ?? '').length + 1 }
}

/** `isInsideAssertion` at the first `boom()` of the text, in a `.test.ts` file. */
function boomIsAsserted(text: string): boolean {
	return isInsideAssertion({
		text,
		file: 'a.test.ts',
		location: locationOf({ text, marker: 'boom()' }),
	})
}

describe('isInsideAssertion on a node:assert call', () => {
	it('boom() in assert.equal(...), assert a default import of node:assert → inside an assertion', () => {
		expect(boomIsAsserted("import assert from 'node:assert'\nassert.equal(boom(), 1)\n")).toBe(true)
	})

	it('boom() in assert.equal(...), assert a namespace import of node:assert → inside an assertion', () => {
		expect(boomIsAsserted("import * as assert from 'node:assert'\nassert.equal(boom(), 1)\n")).toBe(
			true,
		)
	})

	it('boom() in equal(...), equal a named import of node:assert → inside an assertion', () => {
		expect(boomIsAsserted("import { equal } from 'node:assert'\nequal(boom(), 1)\n")).toBe(true)
	})

	it('boom() in eq(...), eq the local name of a named import of node:assert → inside an assertion', () => {
		expect(boomIsAsserted("import { equal as eq } from 'node:assert'\neq(boom(), 1)\n")).toBe(true)
	})

	it('boom() in deepStrictEqual(...), a named import of node:assert/strict → inside an assertion', () => {
		expect(
			boomIsAsserted(
				"import { deepStrictEqual } from 'node:assert/strict'\ndeepStrictEqual(boom(), 1)\n",
			),
		).toBe(true)
	})

	it('boom() in assert.equal(...), assert a default import of node:assert/strict → inside an assertion', () => {
		expect(
			boomIsAsserted("import assert from 'node:assert/strict'\nassert.equal(boom(), 1)\n"),
		).toBe(true)
	})

	it('boom() in assert.equal(...), assert a default import of assert → inside an assertion', () => {
		expect(boomIsAsserted("import assert from 'assert'\nassert.equal(boom(), 1)\n")).toBe(true)
	})

	it('boom() in assert(...) called itself, assert a default import of node:assert → inside an assertion', () => {
		expect(boomIsAsserted("import assert from 'node:assert'\nassert(boom())\n")).toBe(true)
	})

	it('boom() in assert.strict.equal(...), assert a default import of node:assert → inside an assertion', () => {
		expect(
			boomIsAsserted("import assert from 'node:assert'\nassert.strict.equal(boom(), 1)\n"),
		).toBe(true)
	})

	it('boom() in assert.equal(...), assert the strict binding of node:assert renamed → inside an assertion', () => {
		expect(
			boomIsAsserted("import { strict as assert } from 'node:assert'\nassert.equal(boom(), 1)\n"),
		).toBe(true)
	})

	it('boom() in t.assert.equal(...), t the test context, no import → inside an assertion', () => {
		expect(boomIsAsserted("it('a', (t) => {\n\tt.assert.equal(boom(), 1)\n})\n")).toBe(true)
	})

	it('boom() nested in another call inside assert.equal(...) → inside an assertion', () => {
		expect(
			boomIsAsserted("import assert from 'node:assert'\nassert.equal(wrap(boom()), 1)\n"),
		).toBe(true)
	})

	it('boom() called in a const before assert.equal(...) → not inside an assertion', () => {
		expect(
			boomIsAsserted("import assert from 'node:assert'\nconst r = boom()\nassert.equal(r, 1)\n"),
		).toBe(false)
	})

	it('boom() in equal(...), equal not imported from node:assert → not inside an assertion', () => {
		expect(boomIsAsserted("import { equal } from './helpers.ts'\nequal(boom(), 1)\n")).toBe(false)
	})

	it('boom() in other(...) while only equal is imported from node:assert → not inside an assertion', () => {
		expect(boomIsAsserted("import { equal } from 'node:assert'\nother(boom(), 1)\n")).toBe(false)
	})
})

describe('testCallTextAt where node locates a modified call', () => {
	it('a location on skip of it.skip(...) → the whole call', () => {
		const text = "describe('add', () => {\n  it.skip('sk', () => {})\n})\n"

		expect(
			testCallTextAt({ text, file: 'a.test.ts', location: locationOf({ text, marker: 'skip(' }) }),
		).toBe("it.skip('sk', () => {})")
	})

	it('a location on only of it.only(...) → the whole call', () => {
		const text = "describe('add', () => {\n  it.only('on', () => {})\n})\n"

		expect(
			testCallTextAt({ text, file: 'a.test.ts', location: locationOf({ text, marker: 'only(' }) }),
		).toBe("it.only('on', () => {})")
	})

	it('a location on skip of describe.skip(...) holding a case → the describe call, never the case inside', () => {
		const text = "describe.skip('add', () => {\n  it('one', () => {})\n})\n"

		expect(
			testCallTextAt({ text, file: 'a.test.ts', location: locationOf({ text, marker: 'skip(' }) }),
		).toBe("describe.skip('add', () => {\n  it('one', () => {})\n})")
	})

	it('a location on a property that is no call callee → no call text', () => {
		const text = 'const value = options.skip\n'

		expect(
			testCallTextAt({ text, file: 'a.test.ts', location: locationOf({ text, marker: 'skip' }) }),
		).toBeUndefined()
	})
})

describe('moduleMockCalls', () => {
	const CASES: Record<string, { text: string; calls: ModuleMockCall[] }> = {
		"vi.mock('./x') on the vi imported from vitest → its line": {
			text: "import { vi } from 'vitest'\nvi.mock('./x')\n",
			calls: [{ method: 'mock', line: 2 }],
		},
		"vi.mock(import('./x')) → its line, whatever the argument": {
			text: "import { vi } from 'vitest'\n\nvi.mock(import('./x'), () => ({ x: 1 }))\n",
			calls: [{ method: 'mock', line: 3 }],
		},
		"vi.doMock('x') inside a test → its line": {
			text: "import { it, vi } from 'vitest'\nit('a', () => {\n\tvi.doMock('x')\n})\n",
			calls: [{ method: 'doMock', line: 3 }],
		},
		"import { vi as v } then v.mock('x') → its line": {
			text: "import { vi as v } from 'vitest'\nv.mock('x')\n",
			calls: [{ method: 'mock', line: 2 }],
		},
		"import * as vitest from 'vitest' then vitest.vi.mock('x') → its line": {
			text: "import * as vitest from 'vitest'\nvitest.vi.mock('x')\n",
			calls: [{ method: 'mock', line: 2 }],
		},
		"the global vi (no import) vi.mock('x') → its line": {
			text: "vi.mock('x')\n",
			calls: [{ method: 'mock', line: 1 }],
		},
		"fixture.mock('x') → none (another receiver)": {
			text: "import { vi } from 'vitest'\nconst fixture = { mock: (name: string) => name }\nfixture.mock('x')\n",
			calls: [],
		},
		"vi.spyOn(a, 'b'), vi.fn(), vi.stubGlobal, vi.hoisted(...) → none": {
			text: [
				"import { vi } from 'vitest'",
				'const a = { b: () => 1 }',
				"vi.spyOn(a, 'b')",
				'const f = vi.fn()',
				"vi.stubGlobal('x', 1)",
				'const hoisted = vi.hoisted(() => ({ f }))',
				'',
			].join('\n'),
			calls: [],
		},
	}
	for (const [name, testCase] of Object.entries(CASES))
		it(name, () => {
			expect(moduleMockCalls({ text: testCase.text, file: 'a.test.ts' })).toEqual(testCase.calls)
		})
})
