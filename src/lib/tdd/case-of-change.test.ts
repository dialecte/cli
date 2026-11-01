import { isCaseOfBase, isCaseOfChange } from './case-of-change.ts'

import { describe, expect, it } from 'vitest'

import type { SourceLocation } from './tdd.types.ts'

const BASE = [
	"import { expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one plus two', () => { expect(add(1, 2)).toBe(3) })",
	"\tfor (const [name, sum] of Object.entries({ 'row a': 1 })) it(name, () => expect(sum).toBe(1))",
	"\tit.each([1, 2])('adds %i', (value) => { expect(value).toBeGreaterThan(0) })",
	'})',
	'',
].join('\n')

/** The location of the first `it` on the line holding `marker`, or of the `(` after its `])`. */
function locationOf(params: {
	text: string
	marker: string
	parenthesis?: boolean
}): SourceLocation {
	const lines = params.text.split('\n')
	const line = lines.findIndex((candidate) => candidate.includes(params.marker))
	const column = params.parenthesis
		? lines[line].indexOf('])(') + 2
		: lines[line].search(/\bit[.(]/)
	return { line: line + 1, column: column + 1 }
}

type Case = {
	/** Located at the `(` of the call that takes the title, as vitest locates `it.each` cases. */
	parenthesis?: boolean
	text: string
	baseText: string | undefined
	name: string
	marker: string
	changed: boolean
}

const CASES: Record<string, Case> = {
	'a new file → every case of it': {
		text: BASE,
		baseText: undefined,
		name: 'add > one plus two',
		marker: "it('one plus two'",
		changed: true,
	},
	'the same call at the base → not of the change': {
		text: BASE,
		baseText: BASE,
		name: 'add > one plus two',
		marker: "it('one plus two'",
		changed: false,
	},
	'its body changed → of the change': {
		text: BASE.replace('toBe(3)', 'toBe(4)'),
		baseText: BASE,
		name: 'add > one plus two',
		marker: "it('one plus two'",
		changed: true,
	},
	'a row added to a table → that row is of the change': {
		text: BASE.replace("{ 'row a': 1 }", "{ 'row a': 1, 'row b': 1 }"),
		baseText: BASE,
		name: 'add > row b',
		marker: 'Object.entries',
		changed: true,
	},
	'a row already at the base, next to an added one → not of the change': {
		text: BASE.replace("{ 'row a': 1 }", "{ 'row a': 1, 'row b': 1 }"),
		baseText: BASE,
		name: 'add > row a',
		marker: 'Object.entries',
		changed: false,
	},
	'a computed title (it.each %i), its call unchanged → not of the change': {
		text: BASE,
		baseText: BASE,
		name: 'add > adds 2',
		marker: 'it.each',
		changed: false,
	},
	'it.each located at the parenthesis of its second call (as vitest gives it), unchanged → not of the change':
		{
			text: BASE,
			baseText: BASE,
			name: 'add > adds 1',
			marker: 'it.each',
			parenthesis: true,
			changed: false,
		},
	'a case renamed (its describe title new) → of the change': {
		text: BASE.replace("describe('add'", "describe('sum'"),
		baseText: BASE,
		name: 'sum > one plus two',
		marker: "it('one plus two'",
		changed: true,
	},
	'no location (the runner gave none), the file changed → of the change': {
		text: BASE.replace('toBe(3)', 'toBe(4)'),
		baseText: BASE,
		name: 'add > adds 1',
		marker: '',
		changed: true,
	},
}

describe('isCaseOfChange', () => {
	for (const [name, testCase] of Object.entries(CASES))
		it(name, () => {
			const location = testCase.marker
				? locationOf({
						text: testCase.text,
						marker: testCase.marker,
						parenthesis: testCase.parenthesis,
					})
				: undefined

			expect(
				isCaseOfChange({
					file: { file: 'src/add.test.ts', text: testCase.text, baseText: testCase.baseText },
					name: testCase.name,
					location,
				}),
			).toBe(testCase.changed)
		})
})

describe('isCaseOfBase', () => {
	it('a new it reusing a title of the base inside another describe of the base → the new case is not of the base; the base case, its call still the only one in its describe, is', () => {
		const base = [
			"describe('add', () => { it('returns zero', () => { expect(add(0, 0)).toBe(0) }) })",
			"describe('sub', () => { it('one', () => { expect(sub(1, 0)).toBe(1) }) })",
			'',
		].join('\n')
		const text = base.replace(
			"it('one', () => { expect(sub(1, 0)).toBe(1) })",
			"it('one', () => { expect(sub(1, 0)).toBe(1) }); it('returns zero', () => { expect(sub(0, 0)).toBe(0) })",
		)
		const file = { file: 'src/math.test.ts', text, baseText: base }

		expect({
			reused: isCaseOfBase({ file, name: 'sub > returns zero' }),
			original: isCaseOfBase({ file, name: 'add > returns zero' }),
		}).toEqual({ reused: false, original: true })
	})

	const MATH_BASE = [
		"describe('add', () => { it('returns zero', () => { expect(add(0, 0)).toBe(0) }) })",
		"describe('sub', () => { it('one', () => { expect(sub(1, 0)).toBe(1) }) })",
		'',
	].join('\n')

	const MUL_BASE = [
		"const CASES = [{ title: 'zero', left: 0, expected: 0 }]",
		"describe('mul', () => { for (const row of CASES) it(row.title, () => { expect(mul(row.left, 3)).toBe(row.expected) }) })",
		'',
	].join('\n')

	const EACH_BASE = [
		"describe.each([1, 2])('add %i', (value) => { it('returns zero', () => { expect(add(value, -value)).toBe(0) }) })",
		'',
	].join('\n')

	const BASE_CASES: Record<
		string,
		{ baseText: string; text: string; name: string; ofBase: boolean }
	> = {
		'a constant equal to a title removed while a new it of that title is added in another describe → the new case is not of the base':
			{
				baseText: `const LABEL = 'returns zero'\n${MATH_BASE}`,
				text: MATH_BASE.replace(
					"it('one', () => { expect(sub(1, 0)).toBe(1) })",
					"it('one', () => { expect(sub(1, 0)).toBe(1) }); it('returns zero', () => { expect(sub(0, 0)).toBe(0) })",
				),
				name: 'sub > returns zero',
				ofBase: false,
			},
		'a test of the base moved to another describe of the base → not of the base': {
			baseText: MATH_BASE,
			text: [
				"describe('add', () => {})",
				"describe('sub', () => { it('one', () => { expect(sub(1, 0)).toBe(1) }); it('returns zero', () => { expect(add(0, 0)).toBe(0) }) })",
				'',
			].join('\n'),
			name: 'sub > returns zero',
			ofBase: false,
		},
		'the case of the base, its body edited → of the base': {
			baseText: MATH_BASE,
			text: MATH_BASE.replace('expect(add(0, 0)).toBe(0)', 'expect(add(0, 0)).toStrictEqual(0)'),
			name: 'add > returns zero',
			ofBase: true,
		},
		'a literal it title inside a describe.each (its title computed), its body edited → of the base':
			{
				baseText: EACH_BASE,
				text: EACH_BASE.replace('toBe(0)', 'toStrictEqual(0)'),
				name: 'add 1 > returns zero',
				ofBase: true,
			},
		'a string equal to the title added now outside any test call (a message), the call of the base in place → of the base':
			{
				baseText: MATH_BASE,
				text: `const MESSAGE = 'returns zero'\n${MATH_BASE}`,
				name: 'add > returns zero',
				ofBase: true,
			},
		'a second it of the same title added in the same describe → not of the base': {
			baseText: MATH_BASE,
			text: MATH_BASE.replace(
				"it('returns zero', () => { expect(add(0, 0)).toBe(0) })",
				"it('returns zero', () => { expect(add(0, 0)).toBe(0) }); it('returns zero', () => { expect(add(1, -1)).toBe(0) })",
			),
			name: 'add > returns zero',
			ofBase: false,
		},
		'a table row title at the base (it(row.title)) written now as a literal it title, its row removed → not of the base':
			{
				baseText: MUL_BASE,
				text: [
					'const CASES = []',
					"describe('mul', () => { for (const row of CASES) it(row.title, () => { expect(mul(row.left, 3)).toBe(row.expected) }); it('zero', () => { expect(mul(0, 3)).toBe(0) }) })",
					'',
				].join('\n'),
				name: 'mul > zero',
				ofBase: false,
			},
		'a describe added now whose literal title equals the title (no test call) → the case of the base still of the base':
			{
				baseText: MATH_BASE,
				text: `${MATH_BASE}describe('returns zero', () => { it('one', () => { expect(sub(1, 0)).toBe(1) }) })\n`,
				name: 'add > returns zero',
				ofBase: true,
			},
		'an it.each added in another describe with the title as its format (never a literal title) → that case is not of the base':
			{
				baseText: MATH_BASE,
				text: MATH_BASE.replace(
					"it('one', () => { expect(sub(1, 0)).toBe(1) })",
					"it('one', () => { expect(sub(1, 0)).toBe(1) }); it.each([0])('returns zero', (value) => { expect(sub(value, 0)).toBe(0) })",
				),
				name: 'sub > returns zero',
				ofBase: false,
			},
		'a table row title (it(row.title)), the row of the base edited → of the base, as the string rule says':
			{
				baseText: MUL_BASE,
				text: MUL_BASE.replace('left: 0, expected: 0', 'left: 0, expected: -0'),
				name: 'mul > zero',
				ofBase: true,
			},
	}

	for (const [name, row] of Object.entries(BASE_CASES))
		it(name, () => {
			expect(
				isCaseOfBase({
					file: { file: 'src/math.test.ts', text: row.text, baseText: row.baseText },
					name: row.name,
				}),
			).toBe(row.ofBase)
		})
})
