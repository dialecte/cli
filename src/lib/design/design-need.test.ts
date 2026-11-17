/**
 * `designNeedOf` (DESIGN-GATE section 1): a lot needs a design when a path it reaches is in a declared shared area, a
 * scope entry is broader than one, or its plan entry is of kind `lot`; a fix entry touching nothing declared does not.
 */
import { designNeedOf } from './design-need.ts'

import { describe, expect, it } from 'vitest'

import type { DesignNeed, DesignNeedInput } from './design.types.ts'

const STORE_GLOB = 'src/lib/store/**'
const RECORD_FILE = 'src/commands/record.ts'

type NeedCase = { name: string; input: DesignNeedInput; expected: DesignNeed }

const cases: NeedCase[] = [
	{
		name: 'a fix entry touching nothing declared -> not required',
		input: { entryKind: 'fix', declaredHigh: [STORE_GLOB], paths: ['src/lib/text.ts'] },
		expected: { required: false, reasons: [] },
	},
	{
		name: 'no plan entry and no declared area reached -> not required',
		input: { entryKind: undefined, declaredHigh: [STORE_GLOB], paths: ['src/lib/text.ts'] },
		expected: { required: false, reasons: [] },
	},
	{
		name: 'a lot entry -> required by its kind alone',
		input: { entryKind: 'lot', declaredHigh: [], paths: ['src/lib/text.ts'] },
		expected: { required: true, reasons: [{ kind: 'entry' }] },
	},
	{
		name: 'a path in a declared folder -> required, the glob and the path named',
		input: { entryKind: 'fix', declaredHigh: [STORE_GLOB], paths: ['src/lib/store/publish.ts'] },
		expected: {
			required: true,
			reasons: [{ kind: 'shared', glob: STORE_GLOB, path: 'src/lib/store/publish.ts' }],
		},
	},
	{
		name: "a scope entry that is a declared glob's own folder -> required",
		input: { entryKind: undefined, declaredHigh: [STORE_GLOB], paths: ['src/lib/store'] },
		expected: {
			required: true,
			reasons: [{ kind: 'shared', glob: STORE_GLOB, path: 'src/lib/store' }],
		},
	},
	{
		name: 'a scope entry broader than a declared area -> required, each area it may touch named',
		input: { entryKind: undefined, declaredHigh: [STORE_GLOB, RECORD_FILE], paths: ['src/'] },
		expected: {
			required: true,
			reasons: [
				{ kind: 'shared', glob: STORE_GLOB, path: 'src/' },
				{ kind: 'shared', glob: RECORD_FILE, path: 'src/' },
			],
		},
	},
	{
		name: 'two paths under one glob -> one shared reason, the first path named',
		input: {
			entryKind: undefined,
			declaredHigh: [STORE_GLOB],
			paths: ['src/lib/store/publish.ts', 'src/lib/store/brief.ts'],
		},
		expected: {
			required: true,
			reasons: [{ kind: 'shared', glob: STORE_GLOB, path: 'src/lib/store/publish.ts' }],
		},
	},
	{
		name: 'a lot entry reaching a declared file -> the entry reason, then the shared one',
		input: { entryKind: 'lot', declaredHigh: [RECORD_FILE], paths: [RECORD_FILE] },
		expected: {
			required: true,
			reasons: [{ kind: 'entry' }, { kind: 'shared', glob: RECORD_FILE, path: RECORD_FILE }],
		},
	},
]

describe('designNeedOf', () => {
	it.each(cases)('$name', ({ input, expected }) => {
		expect(designNeedOf(input)).toEqual(expected)
	})
})
