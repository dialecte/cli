/**
 * A hand check of the JSON Schema keywords the cli's `*.schema.json` files use (required, additionalProperties, type,
 * enum, items, minimum, $ref, oneOf), so a drift between an output and its schema fails a test without a validator
 * dependency.
 */
import type { JsonSchema } from './json-schema-faults.types.ts'

/** The faults of `value` against `schema` (its `$ref`s point into the schema's `$defs`); empty when it validates. */
export function schemaFaultsOf(params: { value: unknown; schema: JsonSchema }): string[] {
	return faultsOf({ ...params, root: params.schema, path: '$' })
}

function faultsOf(params: {
	value: unknown
	schema: JsonSchema
	root: JsonSchema
	path: string
}): string[] {
	const { value, root, path } = params
	const schema = resolved({ schema: params.schema, root })
	const faults: string[] = []
	if (Array.isArray(schema.oneOf)) {
		const holds = (schema.oneOf as JsonSchema[]).some(function validates(option) {
			return faultsOf({ value, schema: option, root, path }).length === 0
		})
		return holds ? [] : [`${path}: matches none of oneOf`]
	}
	if (schema.type !== undefined && !hasType({ value, type: String(schema.type) }))
		return [`${path}: not a ${String(schema.type)}`]
	if (Array.isArray(schema.enum) && !schema.enum.includes(value))
		faults.push(`${path}: not in enum`)
	if (typeof schema.minimum === 'number' && typeof value === 'number' && value < schema.minimum)
		faults.push(`${path}: below minimum`)
	if (Array.isArray(value) && schema.items !== undefined)
		faults.push(
			...value.flatMap(function itemFaults(item, index) {
				return faultsOf({
					value: item,
					schema: schema.items as JsonSchema,
					root,
					path: `${path}[${index}]`,
				})
			}),
		)
	if (schema.type === 'object') faults.push(...objectFaultsOf({ value, schema, root, path }))
	return faults
}

function objectFaultsOf(params: {
	value: unknown
	schema: JsonSchema
	root: JsonSchema
	path: string
}): string[] {
	const { schema, root, path } = params
	const record = params.value as Record<string, unknown>
	const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
	const required = (schema.required ?? []) as string[]
	const missing = required
		.filter(function isMissing(key) {
			return !(key in record)
		})
		.map(function missingFault(key) {
			return `${path}.${key}: missing`
		})
	const additional = schema.additionalProperties
	const unknown = Object.keys(record)
		.filter(function isUnlisted(key) {
			return !(key in properties)
		})
		.flatMap(function unlistedFaults(key) {
			if (additional === false) return [`${path}.${key}: unknown key`]
			if (typeof additional !== 'object' || additional === null) return []
			return faultsOf({
				value: record[key],
				schema: additional as JsonSchema,
				root,
				path: `${path}.${key}`,
			})
		})
	const inner = Object.keys(properties).flatMap(function propertyFaults(key) {
		return key in record
			? faultsOf({
					value: record[key],
					schema: properties[key],
					root,
					path: `${path}.${key}`,
				})
			: []
	})
	return [...missing, ...unknown, ...inner]
}

function resolved(params: { schema: JsonSchema; root: JsonSchema }): JsonSchema {
	const { schema, root } = params
	if (typeof schema.$ref !== 'string') return schema
	const name = schema.$ref.replace('#/$defs/', '')
	return (root.$defs as Record<string, JsonSchema>)[name]
}

function hasType(params: { value: unknown; type: string }): boolean {
	const { value, type } = params
	if (type === 'array') return Array.isArray(value)
	if (type === 'null') return value === null
	if (type === 'integer') return Number.isInteger(value)
	if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
	return typeof value === type
}
