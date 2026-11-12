import { findMethods } from './find-methods.ts'

import { describe, expect, it } from 'vitest'

import type { ApiJson, ApiMethod } from './api-json.types.ts'

const INDEXED_FLIP: ApiMethod = {
	path: 'tx.zorb.flip',
	root: 'tx',
	otherRoutes: [],
	signature: '() => void',
	summary: 'Flips a zorb.',
	intents: ['flip a zorb'],
	declaredAt: 'src/other.ts:1',
	example: undefined,
}

const SOURCE_FLIP: ApiMethod = {
	path: 'src/d.ts#zorbFlip',
	root: 'source',
	otherRoutes: [],
	signature: '(): void',
	summary: 'Flips a zorb.',
	intents: ['flip a zorb'],
	declaredAt: 'src/d.ts:2',
	example: undefined,
}

const INDEXES_OF_CASES: { description: string; indexes: ApiJson[] }[] = [
	{
		description: 'source index listed after the indexed one',
		indexes: [
			{ package: 'scratch-pkg', methods: [INDEXED_FLIP] },
			{ package: 'scratch-pkg', methods: [SOURCE_FLIP] },
		],
	},
	{
		description: 'source index listed before the indexed one',
		indexes: [
			{ package: 'scratch-pkg', methods: [SOURCE_FLIP] },
			{ package: 'scratch-pkg', methods: [INDEXED_FLIP] },
		],
	},
	{
		description: 'both methods in one index',
		indexes: [{ package: 'scratch-pkg', methods: [SOURCE_FLIP, INDEXED_FLIP] }],
	},
]

describe('findMethods with source functions', () => {
	for (const testCase of INDEXES_OF_CASES)
		it(`equal hits, one indexed method and one source function → the indexed one first (${testCase.description})`, () => {
			const found = findMethods({ indexes: testCase.indexes, need: 'flip zorb', limit: 5 })

			expect(found.map((entry) => entry.method.path)).toEqual(['tx.zorb.flip', 'src/d.ts#zorbFlip'])
			expect(found[0].hits).toEqual(found[1].hits)
		})

	it('a source function without intents → its summary and name words count together as intent hits', () => {
		const indexed: ApiMethod = {
			...INDEXED_FLIP,
			path: 'tx.spinner.turn',
			summary: undefined,
			intents: ['rotate something'],
		}
		const source: ApiMethod = {
			...SOURCE_FLIP,
			path: 'src/e.ts#rotateGizmo',
			summary: 'Rotates the wheel of a gizmo.',
			intents: [],
		}

		const found = findMethods({
			indexes: [
				{ package: 'scratch-pkg', methods: [indexed] },
				{ package: 'scratch-pkg', methods: [source] },
			],
			need: 'rotate gizmo wheel',
			limit: 5,
		})

		expect(found.map((entry) => entry.method.path)).toEqual([
			'src/e.ts#rotateGizmo',
			'tx.spinner.turn',
		])
		expect(found[0].hits.intent).toBe(3)
		expect(found[0].matchingIntent).toBeUndefined()
	})

	it('a source function with intents → scored as before: its summary words are no intent hits', () => {
		const indexed: ApiMethod = {
			...INDEXED_FLIP,
			path: 'tx.spinner.turn',
			summary: undefined,
			intents: ['rotate something'],
		}
		const source: ApiMethod = {
			...SOURCE_FLIP,
			path: 'src/e.ts#rotateGizmo',
			summary: 'Rotates the wheel of a gizmo.',
			intents: ['turn it around'],
		}

		const found = findMethods({
			indexes: [
				{ package: 'scratch-pkg', methods: [indexed] },
				{ package: 'scratch-pkg', methods: [source] },
			],
			need: 'rotate gizmo wheel',
			limit: 5,
		})

		expect(found.map((entry) => entry.method.path)).toEqual([
			'tx.spinner.turn',
			'src/e.ts#rotateGizmo',
		])
		expect(found[1].hits.intent).toBe(0)
	})
})
