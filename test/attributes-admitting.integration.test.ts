import { attributesAdmitting } from '../src/lib/schema/attributes-admitting.ts'
import { loadMultiDeclaredDialecte } from './multi-declared-dialecte.ts'
import { loadCoreTestDialecte } from './real-core.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { AttributeAdmitting, LoadedDialecte } from '../src/lib/schema/schema.types.ts'
import type { AnyDialecteConfig, AttributeDefinition } from '@dialecte/core'

const DEFAULT_URI = 'http://dialecte.dev/XML/DEFAULT'
const EXTENSION_URI = 'http://dialecte.dev/XML/DEV-EXT'
/** The type the second way of `AAA_1` names (see the multi-declared fixture). */
const SECOND_WAY_TYPE = `{${EXTENSION_URI}}tAAA_1B`
/** `DD_1`'s own type; `DD_1`'s variants and `DDD_2`'s variants (all the types) are the others. */
const TAG_LEVEL_TYPE = `{${DEFAULT_URI}}tDD_1`
/** A variant of `DD_1`'s type, and one of `DDD_2`'s, in core's test dialecte. */
const VARIANT_TYPE = `{${DEFAULT_URI}}tDD_1A`

let dialecte: LoadedDialecte
let multiDeclared: LoadedDialecte
let withTypes: LoadedDialecte

function enumerated(params: { values: string[] }): AttributeDefinition {
	return { type: { builtin: 'string', facets: { enumeration: params.values } } }
}

beforeAll(async () => {
	dialecte = await loadCoreTestDialecte()
	multiDeclared = await loadMultiDeclaredDialecte()
	// types that declarations and tag levels name carry enumerations of their own
	const { types } = multiDeclared.config
	const config: AnyDialecteConfig = {
		...multiDeclared.config,
		types: {
			...types,
			[SECOND_WAY_TYPE]: {
				attributes: {
					sequence: ['bAAA_1', 'dAAA_1'],
					details: {
						// `p` is admitted by the declaration itself too: one answer
						bAAA_1: enumerated({ values: ['p', 't1'] }),
						dAAA_1: enumerated({ values: ['t2'] }),
					},
				},
				children: { sequence: [], details: {} },
			},
			[TAG_LEVEL_TYPE]: {
				attributes: {
					// two attributes admit `own2`, listed in reverse alphabetical order
					sequence: ['zDD_1', 'yDD_1', 'eDD_1'],
					details: {
						zDD_1: enumerated({ values: ['own1', 'own2'] }),
						yDD_1: enumerated({ values: ['own2'] }),
						eDD_1: enumerated({ values: ['own3'] }),
					},
				},
				children: { sequence: [], details: {} },
			},
			[VARIANT_TYPE]: {
				...types[VARIANT_TYPE],
				attributes: {
					...types[VARIANT_TYPE].attributes,
					details: {
						...types[VARIANT_TYPE].attributes.details,
						bDD_1: enumerated({ values: ['v1'] }),
					},
				},
			},
		},
	}
	withTypes = { ...multiDeclared, config }
})

type AdmittingCase = {
	description: string
	which: () => LoadedDialecte
	value: string
	expected: AttributeAdmitting[]
}

function core(): LoadedDialecte {
	return dialecte
}

function declared(): LoadedDialecte {
	return multiDeclared
}

function typed(): LoadedDialecte {
	return withTypes
}

const CASES: AdmittingCase[] = [
	{
		description: 'a value of core’s enumerated attribute → that attribute',
		which: core,
		value: 'y',
		expected: [{ tag: 'A', attribute: 'bA' }],
	},
	{
		description: 'a value no attribute admits → none',
		which: core,
		value: 'nobody',
		expected: [],
	},
	{
		description: 'the same value in another case → none (case kept)',
		which: core,
		value: 'Y',
		expected: [],
	},
	{
		description: 'a value that only contains an admitted one → none (exact match)',
		which: core,
		value: 'xy',
		expected: [],
	},
	{
		description: 'a value that is only a part of an admitted one → none (exact match)',
		which: declared,
		value: 'pq',
		expected: [],
	},
	{
		description: 'a value only a declaration admits → the tag and its attribute',
		which: declared,
		value: 'p',
		expected: [{ tag: 'AAA_1', attribute: 'bAAA_1' }],
	},
	{
		description: 'a value admitted by two tags → both, sorted by tag',
		which: declared,
		value: 'x',
		expected: [
			{ tag: 'A', attribute: 'bA' },
			{ tag: 'AAA_1', attribute: 'bAAA_1' },
		],
	},
	{
		description: 'the same value in another case, in a declaration → none',
		which: declared,
		value: 'P',
		expected: [],
	},
	{
		description: 'a value only the type a declaration names admits → the tag and its attribute',
		which: typed,
		value: 't1',
		expected: [{ tag: 'AAA_1', attribute: 'bAAA_1' }],
	},
	{
		description: 'a value only the type a declaration names admits, on another attribute',
		which: typed,
		value: 't2',
		expected: [{ tag: 'AAA_1', attribute: 'dAAA_1' }],
	},
	{
		description: 'a value admitted by a declaration and by its type → once',
		which: typed,
		value: 'p',
		expected: [{ tag: 'AAA_1', attribute: 'bAAA_1' }],
	},
	{
		description: 'a value only the type a tag level names admits → the tag and its attribute',
		which: typed,
		value: 'own1',
		expected: [{ tag: 'DD_1', attribute: 'zDD_1' }],
	},
	{
		description:
			'a value only a variant admits → every tag naming that variant, in code-unit order',
		which: typed,
		value: 'v1',
		expected: [
			{ tag: 'DDD_2', attribute: 'bDD_1' },
			{ tag: 'DD_1', attribute: 'bDD_1' },
		],
	},
	{
		description:
			'a value two attributes of one tag admit, listed in reverse order → sorted by attribute',
		which: typed,
		value: 'own2',
		expected: [
			{ tag: 'DD_1', attribute: 'yDD_1' },
			{ tag: 'DD_1', attribute: 'zDD_1' },
		],
	},
]

describe('attributesAdmitting', () => {
	it.each(CASES)('$description', ({ which, value, expected }) => {
		expect(attributesAdmitting({ dialecte: which(), value })).toEqual(expected)
	})
})
