import { loadCoreTestDialecte } from '../../../test/real-core.ts'
import { sampleAttributeValue, textValues } from './sample-attribute.ts'
import { acceptsValue, datatypeValues } from './sample-datatype.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type {
	LoadedDialecte,
	SchemaDataType,
	SchemaElementDefinition,
} from '../schema/schema.types.ts'
import type { SampleResult, ValuesResult } from './fixture.types.ts'

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadCoreTestDialecte()
})

describe('datatypeValues (core readers)', () => {
	type TestCase = {
		datatype: SchemaDataType | undefined
		limit?: number
		expected: ValuesResult
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'an enumeration → its values, first first': {
			datatype: { builtin: 'string', facets: { enumeration: ['open', 'closed'] } },
			limit: 2,
			expected: { values: ['open', 'closed'] },
		},
		'a union of a pattern member and an enumerated one → the enumerated value first': {
			datatype: {
				union: [
					{ builtin: 'string', facets: { pattern: [['[0-9]+']] } },
					{ builtin: 'string', facets: { enumeration: ['none'] } },
				],
			},
			expected: { values: ['none'] },
		},
		'a union whose first member has a pattern only → a value matching it': {
			datatype: {
				union: [{ builtin: 'string', facets: { pattern: [['[0-9]{2}']] } }, { builtin: 'boolean' }],
			},
			expected: { values: ['00'] },
		},
		'a list → one item': {
			datatype: { list: { builtin: 'unsignedInt' } },
			expected: { values: ['0'] },
		},
		'free text → the tag name, then numbered': {
			datatype: { builtin: 'normalizedString' },
			limit: 2,
			expected: { values: ['AA_1', 'AA_11'] },
		},
		'free text of a fixed length → padded to it': {
			datatype: { builtin: 'string', facets: { length: 8 } },
			expected: { values: ['AA_1aaaa'] },
		},
		'free text shorter than the tag name → cut to it, the number kept': {
			datatype: { builtin: 'string', facets: { maxLength: 3 } },
			limit: 2,
			expected: { values: ['AA_', 'AA1'] },
		},
		'untyped → the tag name': {
			datatype: undefined,
			expected: { values: ['AA_1'] },
		},
		'an exclusive lower bound → the next whole number': {
			datatype: { builtin: 'unsignedInt', facets: { minExclusive: '0' } },
			expected: { values: ['1'] },
		},
		'an inclusive lower bound → it': {
			datatype: { builtin: 'unsignedInt', facets: { minInclusive: '1' } },
			expected: { values: ['1'] },
		},
		'a decimal → 0': {
			datatype: { builtin: 'decimal' },
			expected: { values: ['0'] },
		},
		'a pattern with a length → a value of that length': {
			datatype: { builtin: 'Name', facets: { pattern: [['L[A-Z]*']], length: 4 } },
			expected: { values: ['LAAA'] },
		},
		'a built-in type without a sample → said so': {
			datatype: { builtin: 'QName' },
			expected: { problem: 'the built-in type QName has no sample' },
		},
		'facets nothing satisfies → said so': {
			datatype: { builtin: 'unsignedInt', facets: { maxExclusive: '0' } },
			expected: { problem: 'no value satisfies its facets ({"maxExclusive":"0"})' },
		},
	}

	const entries = Object.entries(testCases)
	const focused = entries.filter(([, testCase]) => testCase.only)
	for (const [description, testCase] of focused.length ? focused : entries)
		it(description, () => {
			expect(
				datatypeValues({
					readers: dialecte.readers,
					datatype: testCase.datatype,
					tagName: 'AA_1',
					limit: testCase.limit ?? 1,
				}),
			).toEqual(testCase.expected)
		})
})

describe('acceptsValue (core readers)', () => {
	type TestCase = { datatype: SchemaDataType; value: string; expected: boolean; only?: boolean }

	const testCases: Record<string, TestCase> = {
		'empty decimal → refused': { datatype: { builtin: 'decimal' }, value: '', expected: false },
		'a length of 6 where 8 is required → refused': {
			datatype: { builtin: 'string', facets: { length: 8 } },
			value: 'AAAA_3',
			expected: false,
		},
		'0 where it must be greater than 0 → refused': {
			datatype: { builtin: 'unsignedInt', facets: { minExclusive: '0' } },
			value: '0',
			expected: false,
		},
		'empty plain string → taken': { datatype: { builtin: 'string' }, value: '', expected: true },
		'a value no member of the union takes → refused': {
			datatype: { union: [{ builtin: 'integer' }, { builtin: 'boolean' }] },
			value: 'x',
			expected: false,
		},
	}

	const entries = Object.entries(testCases)
	const focused = entries.filter(([, testCase]) => testCase.only)
	for (const [description, testCase] of focused.length ? focused : entries)
		it(description, () => {
			expect(
				acceptsValue({
					readers: dialecte.readers,
					datatype: testCase.datatype,
					value: testCase.value,
				}),
			).toBe(testCase.expected)
		})
})

describe('sampleAttributeValue (core test dialecte, core readers)', () => {
	type TestCase = {
		tagName: string
		attributeName: string
		datatype: SchemaDataType | undefined
		expected: SampleResult
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'a fixed value → it, whatever the type': {
			tagName: 'CC_1',
			attributeName: 'aCC_1',
			datatype: { builtin: 'string', facets: { enumeration: ['other'] } },
			expected: { value: 'fixed_val' },
		},
		'a default → it, before the type': {
			tagName: 'Root',
			attributeName: 'root',
			datatype: { builtin: 'string', facets: { enumeration: ['other'] } },
			expected: { value: '1' },
		},
		'an enumeration, no fixed value or default → its first value': {
			tagName: 'A',
			attributeName: 'bA',
			datatype: { builtin: 'string', facets: { enumeration: ['x', 'y', 'z'] } },
			expected: { value: 'x' },
		},
		'a pattern → a value matching it': {
			tagName: 'AAA_1',
			attributeName: 'aAAA_1',
			datatype: { builtin: 'string', facets: { pattern: [['[a-z]{3}']] } },
			expected: { value: 'aaa' },
		},
		'a pattern the sampler does not read → the attribute named': {
			tagName: 'AAA_1',
			attributeName: 'aAAA_1',
			datatype: { builtin: 'string', facets: { pattern: [['(?=a)a']] } },
			expected: {
				problem:
					'no value for AAA_1@aAAA_1: pattern ^(?:(?:(?=a)a))$ uses (?=, which the fixture cannot sample',
			},
		},
	}

	const entries = Object.entries(testCases)
	const focused = entries.filter(([, testCase]) => testCase.only)
	for (const [description, testCase] of focused.length ? focused : entries)
		it(description, () => {
			expect(
				sampleAttributeValue({
					config: dialecte.config,
					readers: dialecte.readers,
					record: { tagName: testCase.tagName, parent: null, attributes: [] },
					attributeName: testCase.attributeName,
					datatype: testCase.datatype,
				}),
			).toEqual(testCase.expected)
		})
})

describe('textValues (core readers)', () => {
	type TestCase = {
		textContent: SchemaElementDefinition['textContent']
		expected: ValuesResult | undefined
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'text an empty value does not satisfy → a sample': {
			textContent: { type: { builtin: 'string', facets: { pattern: [['\\S+']], minLength: 1 } } },
			expected: { values: ['a'] },
		},
		'typed text an empty value satisfies → none': {
			textContent: { type: { builtin: 'string' } },
			expected: undefined,
		},
		'untyped text → none': { textContent: {}, expected: undefined },
		'fixed text → it': {
			textContent: { type: { builtin: 'decimal' }, fixed: '2' },
			expected: { values: ['2'] },
		},
	}

	const entries = Object.entries(testCases)
	const focused = entries.filter(([, testCase]) => testCase.only)
	for (const [description, testCase] of focused.length ? focused : entries)
		it(description, () => {
			const values = textValues({
				readers: dialecte.readers,
				definition: {
					tag: 'BBBB_1',
					parents: [],
					namespace: { prefix: '', uri: 'urn:test' },
					attributes: { sequence: [], details: {} },
					children: { sequence: [] },
					textContent: testCase.textContent,
				},
			})
			expect(
				values === undefined
					? undefined
					: { ...values, ...('values' in values && { values: values.values.slice(0, 1) }) },
			).toEqual(testCase.expected)
		})
})
