import { closestNames } from './closest-names.ts'

import { describe, expect, it } from 'vitest'

const TAGS = [
	'Bay',
	'Bitrate',
	'BDA',
	'ConductingEquipment',
	'LNode',
	'LN',
	'LN0',
	'SubEquipment',
	'Substation',
]

const testCases: { description: string; name: string; expected: string[] }[] = [
	{
		description: 'unknown tag → closest tag names suggested',
		name: 'Bey',
		expected: ['Bay', 'BDA'],
	},
	{ description: 'another case → the tag in its case', name: 'lnode', expected: ['LNode'] },
	{
		description: 'a part of tag names → those holding it',
		name: 'Equipment',
		expected: ['ConductingEquipment', 'SubEquipment'],
	},
	{ description: 'nothing close → nothing', name: 'Zebra', expected: [] },
]

describe('closestNames', () => {
	for (const testCase of testCases)
		it(testCase.description, () => {
			expect(closestNames({ name: testCase.name, candidates: TAGS, limit: 3 })).toEqual(
				testCase.expected,
			)
		})
})
