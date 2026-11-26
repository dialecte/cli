/**
 * A hand check of the JSON Schema keywords the cli's `*.schema.json` files use (required, additionalProperties, type,
 * enum, const, items, minItems, maxItems, minimum, $ref, oneOf, allOf, if/then), so a drift between an output and its
 * schema fails a test without a validator dependency. A `$ref` points into the schema's own `$defs`, or into a sibling
 * schema given by its `$id` (`sibling.schema.json` or `sibling.schema.json#/$defs/name`).
 */
import type { FaultContext, JsonSchema } from './json-schema-faults.types.ts'

/**
 * The faults of `value` against `schema`; empty when it validates. `schemas` are the sibling schemas its `$ref`s
 * may name by `$id`.
 */
export function schemaFaultsOf(params: {
	value: unknown
	schema: JsonSchema
	schemas?: readonly JsonSchema[]
}): string[] {
	return faultsOf({
		value: params.value,
		schema: params.schema,
		context: { root: params.schema, schemas: params.schemas ?? [] },
		path: '$',
	})
}

function faultsOf(params: {
	value: unknown
	schema: JsonSchema
	context: FaultContext
	path: string
}): string[] {
	const { value, path } = params
	const target = resolved({ schema: params.schema, context: params.context })
	if (typeof target === 'string') return [`${path}: ${target}`]
	const { schema, context } = target
	if (Array.isArray(schema.oneOf)) {
		const holds = (schema.oneOf as JsonSchema[]).some(function validates(option) {
			return faultsOf({ value, schema: option, context, path }).length === 0
		})
		return holds ? [] : [`${path}: matches none of oneOf`]
	}
	if (schema.type !== undefined && !hasType({ value, type: String(schema.type) }))
		return [`${path}: not a ${String(schema.type)}`]
	const faults: string[] = []
	if ('const' in schema && !sameValue({ left: value, right: schema.const }))
		faults.push(`${path}: not the const`)
	if (Array.isArray(schema.enum) && !schema.enum.includes(value))
		faults.push(`${path}: not in enum`)
	if (typeof schema.minimum === 'number' && typeof value === 'number' && value < schema.minimum)
		faults.push(`${path}: below minimum`)
	if (Array.isArray(value)) faults.push(...arrayFaultsOf({ value, schema, context, path }))
	// properties, required and additionalProperties apply to any object value, whatever the schema's type says
	if (isSchema(value)) faults.push(...objectFaultsOf({ value, schema, context, path }))
	if (Array.isArray(schema.allOf))
		faults.push(
			...(schema.allOf as JsonSchema[]).flatMap(function partFaults(part) {
				return faultsOf({ value, schema: part, context, path })
			}),
		)
	if (isSchema(schema.if) && isSchema(schema.then)) {
		const holds = faultsOf({ value, schema: schema.if, context, path }).length === 0
		if (holds) faults.push(...faultsOf({ value, schema: schema.then, context, path }))
	}
	return faults
}

function arrayFaultsOf(params: {
	value: readonly unknown[]
	schema: JsonSchema
	context: FaultContext
	path: string
}): string[] {
	const { value, schema, context, path } = params
	const faults: string[] = []
	if (typeof schema.minItems === 'number' && value.length < schema.minItems)
		faults.push(`${path}: below minItems ${String(schema.minItems)}`)
	if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
		faults.push(`${path}: above maxItems ${String(schema.maxItems)}`)
	if (schema.items !== undefined)
		faults.push(
			...value.flatMap(function itemFaults(item, index) {
				return faultsOf({
					value: item,
					schema: schema.items as JsonSchema,
					context,
					path: `${path}[${index}]`,
				})
			}),
		)
	return faults
}

function objectFaultsOf(params: {
	value: unknown
	schema: JsonSchema
	context: FaultContext
	path: string
}): string[] {
	const { schema, context, path } = params
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
				context,
				path: `${path}.${key}`,
			})
		})
	const inner = Object.keys(properties).flatMap(function propertyFaults(key) {
		return key in record
			? faultsOf({
					value: record[key],
					schema: properties[key],
					context,
					path: `${path}.${key}`,
				})
			: []
	})
	return [...missing, ...unknown, ...inner]
}

/**
 * The schema a `$ref` names and the context its own local references read (a sibling's root when the reference goes
 * into a sibling); the schema itself when it holds no `$ref`; why not when the reference names nothing.
 */
function resolved(params: {
	schema: JsonSchema
	context: FaultContext
}): { schema: JsonSchema; context: FaultContext } | string {
	const { schema, context } = params
	if (typeof schema.$ref !== 'string') return { schema, context }
	const reference = schema.$ref
	const [file, pointer = ''] = reference.split('#')
	const root =
		file === ''
			? context.root
			: context.schemas.find(function hasId(sibling) {
					return sibling.$id === file
				})
	if (root === undefined) return `unresolved $ref ${reference}`
	const nextContext = { ...context, root }
	if (pointer === '') return { schema: root, context: nextContext }
	const name = pointer.replace('/$defs/', '')
	const definitions = (root.$defs ?? {}) as Record<string, JsonSchema>
	const definition = definitions[name]
	if (definition === undefined) return `unresolved $ref ${reference}`
	return resolved({ schema: definition, context: nextContext })
}

function isSchema(value: unknown): value is JsonSchema {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether two JSON values are equal (a `const` compares whole values). */
function sameValue(params: { left: unknown; right: unknown }): boolean {
	return JSON.stringify(params.left) === JSON.stringify(params.right)
}

function hasType(params: { value: unknown; type: string }): boolean {
	const { value, type } = params
	if (type === 'array') return Array.isArray(value)
	if (type === 'null') return value === null
	if (type === 'integer') return Number.isInteger(value)
	if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
	return typeof value === type
}
