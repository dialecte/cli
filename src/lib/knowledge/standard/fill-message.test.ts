/** `fillMessage`: every `{name}` filled once, with the value as written (R1-4, D28). */
import { fillMessage } from './fill-message.ts'

import { describe, expect, it } from 'vitest'

type Case = {
	title: string
	template: string
	values: Record<string, string>
	expected: string
}

const CASES: Case[] = [
	{
		title: 'a plain value',
		template: 'round {round} of {cap}',
		values: { round: '2', cap: '3' },
		expected: 'round 2 of 3',
	},
	{
		title: 'a placeholder used twice is filled twice',
		template: '{a} and {a}',
		values: { a: 'x' },
		expected: 'x and x',
	},
	{
		title: 'a value holding $& is kept as written',
		template: 'reason: {reason}',
		values: { reason: 'costs $& more' },
		expected: 'reason: costs $& more',
	},
	{
		title: 'a value holding $1, $$ and a backtick pattern is kept as written',
		template: 'reason: {reason} (end)',
		values: { reason: 'a $1 b $$ c $` d' },
		expected: 'reason: a $1 b $$ c $` d (end)',
	},
	{
		title: 'a value holding {name} of a later placeholder is not filled again',
		template: '{first} then {second}',
		values: { first: 'see {second}', second: 'x' },
		expected: 'see {second} then x',
	},
	{
		title: 'a value holding {name} of an earlier placeholder is not filled again',
		template: '{first} then {second}',
		values: { first: 'x', second: 'see {first}' },
		expected: 'x then see {first}',
	},
	{
		title: 'a placeholder with no value stays as written',
		template: '{known} {unknown}',
		values: { known: 'k' },
		expected: 'k {unknown}',
	},
]

describe('fillMessage', () => {
	for (const { title, template, values, expected } of CASES)
		it(title, () => {
			expect(fillMessage({ template, values })).toBe(expected)
		})
})
