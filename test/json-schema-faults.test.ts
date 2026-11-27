/**
 * The keywords the hand check of JSON Schema learns beyond its first set: const, if/then, allOf, minItems, maxItems
 * and a `$ref` into a sibling schema found by its `$id`. One row per keyword, each naming the fault it must report.
 */
import { schemaFaultsOf } from './json-schema-faults.ts'

import { describe, expect, it } from 'vitest'

import type { JsonSchema } from './json-schema-faults.types.ts'

/** A schema with one keyword added by name: the rows add `then`, which an object member of that name would make read as a thenable. */
function withKeyword(params: {
	schema: JsonSchema
	keyword: string
	value: JsonSchema
}): JsonSchema {
	return { ...params.schema, [params.keyword]: params.value }
}

type FaultRow = {
	value: unknown
	schema: JsonSchema
	schemas?: readonly JsonSchema[]
	expected: readonly string[]
}

/** The faults of a row, or what the check threw (so a row fails on its assertion, not on a throw). */
function faultsOrThrown(row: FaultRow): readonly string[] | string {
	try {
		return schemaFaultsOf({ value: row.value, schema: row.schema, schemas: row.schemas })
	} catch (error) {
		return String(error)
	}
}

const SIBLING: JsonSchema = {
	$id: 'sibling.schema.json',
	type: 'object',
	required: ['schema'],
	$defs: {
		lot: {
			type: 'object',
			required: ['id'],
			properties: { id: { type: 'string' }, run: { $ref: '#/$defs/run' } },
		},
		run: { type: 'object', required: ['runner'] },
	},
}

const CASES: Record<string, FaultRow> = {
	'const: a value other than the const -> not the const': {
		value: { kind: 'b' },
		schema: { type: 'object', properties: { kind: { const: 'a' } } },
		expected: ['$.kind: not the const'],
	},
	'minItems: fewer items than the minimum -> below minItems': {
		value: [1],
		schema: { type: 'array', minItems: 2 },
		expected: ['$: below minItems 2'],
	},
	'maxItems: more items than the maximum -> above maxItems': {
		value: [1, 2],
		schema: { type: 'array', maxItems: 1 },
		expected: ['$: above maxItems 1'],
	},
	'if/then: only the then of the if that holds applies': {
		value: { outcome: 'present' },
		schema: {
			type: 'object',
			allOf: [
				withKeyword({
					schema: {
						if: {
							type: 'object',
							properties: { outcome: { const: 'present' } },
							required: ['outcome'],
						},
					},
					keyword: 'then',
					value: { type: 'object', required: ['state'] },
				}),
				withKeyword({
					schema: {
						if: {
							type: 'object',
							properties: { outcome: { const: 'missing' } },
							required: ['outcome'],
						},
					},
					keyword: 'then',
					value: { type: 'object', required: ['other'] },
				}),
			],
		},
		expected: ['$.state: missing'],
	},
	'allOf: every subschema applies -> the faults of each, in order': {
		value: {},
		schema: {
			allOf: [
				{ type: 'object', required: ['a'] },
				{ type: 'object', required: ['b'] },
			],
		},
		expected: ['$.a: missing', '$.b: missing'],
	},
	'$ref into a sibling schema $defs -> its faults, its own local $ref resolved in the sibling': {
		value: { lot: { id: 7, run: {} } },
		schema: {
			type: 'object',
			properties: { lot: { $ref: 'sibling.schema.json#/$defs/lot' } },
		},
		schemas: [SIBLING],
		expected: ['$.lot.id: not a string', '$.lot.run.runner: missing'],
	},
	'$ref to a sibling schema root -> the faults of that root': {
		value: { state: {} },
		schema: { type: 'object', properties: { state: { $ref: 'sibling.schema.json' } } },
		schemas: [SIBLING],
		expected: ['$.state.schema: missing'],
	},
	'required without type: an object missing the key -> missing': {
		value: {},
		schema: { required: ['a'] },
		expected: ['$.a: missing'],
	},
	'properties and additionalProperties without type: an object -> its unknown key and its property faults':
		{
			value: { a: 7, b: 1 },
			schema: { properties: { a: { type: 'string' } }, additionalProperties: false },
			expected: ['$.b: unknown key', '$.a: not a string'],
		},
	'if without type that fails on an object -> its then does not apply': {
		value: { outcome: 'missing' },
		schema: withKeyword({
			schema: { if: { properties: { outcome: { const: 'present' } }, required: ['outcome'] } },
			keyword: 'then',
			value: { type: 'object', required: ['state'] },
		}),
		expected: [],
	},
	'if without type that holds on an object -> its then without type applies': {
		value: { outcome: 'present' },
		schema: withKeyword({
			schema: { if: { properties: { outcome: { const: 'present' } }, required: ['outcome'] } },
			keyword: 'then',
			value: { required: ['state'] },
		}),
		expected: ['$.state: missing'],
	},
	'$ref naming an unknown $id -> an unresolved fault, never no fault': {
		value: {},
		schema: { $ref: 'nowhere.schema.json#/$defs/lot' },
		schemas: [SIBLING],
		expected: ['$: unresolved $ref nowhere.schema.json#/$defs/lot'],
	},
	'$ref into a sibling with no schemas given -> an unresolved fault, never no fault': {
		value: {},
		schema: { $ref: 'sibling.schema.json' },
		expected: ['$: unresolved $ref sibling.schema.json'],
	},
	'local $ref naming no definition -> an unresolved fault, never no fault': {
		value: {},
		schema: { $ref: '#/$defs/missing', $defs: {} },
		expected: ['$: unresolved $ref #/$defs/missing'],
	},
}

describe('schemaFaultsOf, the keywords of the orchestrator schemas', function keywordRows() {
	it.each(Object.entries(CASES))('%s', function checksRow(_title, row) {
		expect(faultsOrThrown(row)).toEqual(row.expected)
	})
})
