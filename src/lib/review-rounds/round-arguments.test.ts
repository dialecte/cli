import { readArguments } from './round-arguments.ts'

import { describe, expect, it } from 'vitest'

describe('readArguments: repeatable options', () => {
	it('an option given twice and a value option → the repeated values in lists in order, the other in values', () => {
		expect(
			readArguments({
				argv: ['--skill', 'a', '--step', '2', '--skill', 'b'],
				valueOptions: ['step'],
				repeatable: ['skill'],
			}),
		).toMatchObject({
			lists: new Map([['skill', ['a', 'b']]]),
			values: new Map([['step', '2']]),
			words: [],
		})
	})

	it('a repeatable option → never in values', () => {
		expect(
			readArguments({ argv: ['--skill', 'a'], valueOptions: [], repeatable: ['skill'] }),
		).toMatchObject({ values: new Map() })
	})

	it('two repeatable options → each its own list', () => {
		expect(
			readArguments({
				argv: ['--skill', 'a', '--suite', 'x=1', '--skill', 'b', '--suite', 'y=2'],
				valueOptions: [],
				repeatable: ['skill', 'suite'],
			}),
		).toMatchObject({
			lists: new Map([
				['skill', ['a', 'b']],
				['suite', ['x=1', 'y=2']],
			]),
		})
	})

	it('a repeatable option given last without its value → needs a value', () => {
		expect(readArguments({ argv: ['--skill'], valueOptions: [], repeatable: ['skill'] })).toBe(
			'--skill needs a value',
		)
	})

	it('a repeatable option, a flag and words → flags and words as before', () => {
		expect(
			readArguments({
				argv: ['one', '--json', '--skill', 'a', 'two', '--', '--skill'],
				valueOptions: [],
				flags: ['json'],
				repeatable: ['skill'],
			}),
		).toMatchObject({
			flags: new Set(['json']),
			lists: new Map([['skill', ['a']]]),
			words: ['one', 'two', '--skill'],
		})
	})

	it('a value option given twice → the last wins, existing behaviour unchanged (a guard)', () => {
		expect(
			readArguments({ argv: ['--step', '1', '--step', '2'], valueOptions: ['step'] }),
		).toMatchObject({ values: new Map([['step', '2']]), words: [] })
	})

	it('an option no list names, beside a repeatable one → still unknown', () => {
		expect(
			readArguments({
				argv: ['--skill', 'a', '--zzz', 'a'],
				valueOptions: [],
				repeatable: ['skill'],
			}),
		).toBe('unknown option --zzz')
	})
})
