import { isCaseOfChange } from './case-of-change.ts'

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
