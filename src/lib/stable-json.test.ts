import { stableJson } from './stable-json.ts'

import { describe, expect, it } from 'vitest'

type StableJsonCase = { description: string; value: unknown; expected: string }

const CASES: StableJsonCase[] = [
	{ description: 'keys of an object are sorted', value: { b: 1, a: 2 }, expected: '{"a":2,"b":1}' },
	{
		description: 'keys are sorted at every depth, inside arrays too',
		value: {
			z: { b: 1, a: 2 },
			y: [
				{ d: 1, c: 2 },
				{ b: 1, a: 2 },
			],
		},
		expected: '{"y":[{"c":2,"d":1},{"a":2,"b":1}],"z":{"a":2,"b":1}}',
	},
	{
		description: 'keys are compared by code unit, not by locale (upper case, underscore, prefixes)',
		value: { b: 1, B: 2, a: 3, _: 4, A_1: 5, AA: 6 },
		expected: '{"AA":6,"A_1":5,"B":2,"_":4,"a":3,"b":1}',
	},
	{ description: 'arrays keep their order', value: [3, 1, 2], expected: '[3,1,2]' },
	{
		description: 'an undefined member is dropped, at any depth',
		value: { a: undefined, c: { e: undefined, d: 1 }, b: 1 },
		expected: '{"b":1,"c":{"d":1}}',
	},
	{
		description: 'an undefined array item is null, as JSON has it',
		value: [undefined],
		expected: '[null]',
	},
	{ description: 'a string is quoted', value: 'x', expected: '"x"' },
	{ description: 'null is null', value: null, expected: 'null' },
]

class Instance {
	member = 1
}

type RefusedCase = { description: string; value: unknown }

const REFUSED: RefusedCase[] = [
	{ description: 'a Date', value: new Date(0) },
	{ description: 'a Map', value: new Map([['a', 1]]) },
	{ description: 'a Set', value: new Set([1]) },
	{ description: 'a RegExp', value: /a/ },
	{ description: 'a class instance', value: new Instance() },
	{ description: 'a class instance nested in an object', value: { a: { b: new Instance() } } },
	{ description: 'a Date nested in an array', value: [{ when: new Date(0) }] },
	{ description: 'a sparse array', value: [1, , 3] },
	{ description: 'a function', value: () => 1 },
	{ description: 'a function member of an object', value: { a: () => 1 } },
	{ description: 'a symbol', value: Symbol('s') },
	{ description: 'a symbol member of an object', value: { a: Symbol('s') } },
	{ description: 'a bigint', value: 1n },
	{ description: 'a bigint member of an object', value: { a: 1n } },
]

describe('stableJson', () => {
	it.each(CASES)('$description', ({ value, expected }) => {
		expect(stableJson(value)).toBe(expected)
	})

	it('an object without a prototype is plain data', () => {
		expect(stableJson(Object.assign(Object.create(null), { b: 1, a: 2 }))).toBe('{"a":2,"b":1}')
	})

	it.each(REFUSED)('throws on $description (not plain JSON data)', ({ value }) => {
		expect(() => stableJson(value)).toThrow(/not plain JSON/)
	})
})
