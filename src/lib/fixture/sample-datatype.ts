/**
 * The values of a simple type, read through core's readers and checked against every facet the definition
 * writes: enumerations, patterns, lengths, numeric ranges, the lexical form of the built-in type.
 */
import {
	BOOLEAN_VALUES,
	BUILTIN_SAMPLES,
	INTEGER_BUILTINS,
	NON_EMPTY_BUILTINS,
	NUMERIC_BUILTINS,
	TEXT_BUILTINS,
} from './fixture.constants.ts'
import { patternValues } from './sample-pattern.ts'

import type { CoreReaders } from '../schema/schema.types.ts'
import type { ValuesResult } from './fixture.types.ts'
import type { DataType, Facets } from '@dialecte/core'

/**
 * Up to `limit` distinct values of the type, best first: its enumerated values, else strings its patterns
 * match, else a member's values (a union) or one item's (a list), else values of its built-in type - numbers
 * counting from the lowest its range allows, free text from the tag name, fitted to its lengths. Every value
 * is one `acceptsValue` takes. None → the problem; an untyped value is free text.
 */
export function datatypeValues(params: {
	readers: CoreReaders
	datatype: DataType | undefined
	tagName: string
	limit: number
}): ValuesResult {
	const { readers, datatype, tagName, limit } = params
	if (datatype === undefined) return { values: textValues({ tagName, facets: undefined, limit }) }
	const values: string[] = []
	const problems: string[] = []
	function offer(value: string): void {
		if (
			values.length < limit &&
			!values.includes(value) &&
			acceptsValue({ readers, datatype, value })
		)
			values.push(value)
	}

	for (const value of readers.enumeratedValues(datatype)) offer(value)
	const patterns = readers.valuePatterns(datatype)
	if (patterns.length && values.length < limit) {
		const matched = patternValues({
			patterns,
			limit,
			accepts: (value) => acceptsValue({ readers, datatype, value }),
		})
		if ('problem' in matched) problems.push(matched.problem)
		else matched.values.forEach(offer)
	}
	for (const member of 'union' in datatype ? datatype.union : []) {
		if (values.length >= limit) break
		const offered = datatypeValues({ readers, datatype: member, tagName, limit })
		if ('problem' in offered) problems.push(offered.problem)
		else offered.values.forEach(offer)
	}
	if ('list' in datatype && values.length < limit) {
		const items = datatypeValues({ readers, datatype: datatype.list, tagName, limit })
		if ('problem' in items) problems.push(items.problem)
		else items.values.forEach(offer)
	}
	const builtin = 'builtin' in datatype ? datatype.builtin : undefined
	if (builtin !== undefined && values.length < limit) {
		if (NUMERIC_BUILTINS.has(builtin))
			numberValues({ builtin, facets: datatype.facets, limit: limit * 4 }).forEach(offer)
		else if (builtin in BUILTIN_SAMPLES) offer(BUILTIN_SAMPLES[builtin])
		else if (TEXT_BUILTINS.has(builtin))
			textValues({ tagName, facets: datatype.facets, limit: limit * 4 }).forEach(offer)
		else problems.push(`the built-in type ${builtin} has no sample`)
	}

	if (values.length) return { values }
	return {
		problem: problems.length
			? problems.join('; ')
			: `no value satisfies its facets (${JSON.stringify(datatype.facets ?? {})})`,
	}
}

/** Whether the type takes the value: its enumeration, its patterns, its lengths and range, its members or items, its built-in form. */
export function acceptsValue(params: {
	readers: CoreReaders
	datatype: DataType | undefined
	value: string
}): boolean {
	const { readers, datatype, value } = params
	if (datatype === undefined) return true
	const facets = datatype.facets ?? {}
	if (facets.enumeration && !facets.enumeration.includes(value)) return false
	if (!readers.valuePatterns(datatype).every((pattern) => pattern.test(value))) return false

	if ('list' in datatype) {
		const itemType = datatype.list
		const items = value.trim() === '' ? [] : value.trim().split(/\s+/u)
		return (
			fitsLength({ length: items.length, facets }) &&
			items.every((item) => acceptsValue({ readers, datatype: itemType, value: item }))
		)
	}
	if (!fitsLength({ length: [...value].length, facets })) return false
	if ('union' in datatype)
		return datatype.union.some((member) => acceptsValue({ readers, datatype: member, value }))

	const builtin = 'builtin' in datatype ? datatype.builtin : undefined
	if (builtin === undefined) return true
	if (value === '' && NON_EMPTY_BUILTINS.has(builtin)) return false
	if (builtin === 'boolean') return BOOLEAN_VALUES.has(value)
	if (NUMERIC_BUILTINS.has(builtin)) return isNumberOf({ builtin, value, facets })
	return true
}

function fitsLength(params: { length: number; facets: Facets }): boolean {
	const { length, facets } = params
	return (
		(facets.length === undefined || length === facets.length) &&
		(facets.minLength === undefined || length >= facets.minLength) &&
		(facets.maxLength === undefined || length <= facets.maxLength)
	)
}

/** A number in the built-in type's lexical form, its own sign rule and the facets' range. */
function isNumberOf(params: { builtin: string; value: string; facets: Facets }): boolean {
	const { builtin, value, facets } = params
	const form = INTEGER_BUILTINS.has(builtin) ? /^[+-]?\d+$/u : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u
	if (!form.test(value)) return false
	const number = Number(value)
	if (builtin.startsWith('unsigned') || builtin === 'nonNegativeInteger') {
		if (number < 0) return false
	}
	if (builtin === 'positiveInteger' && number < 1) return false
	if (builtin === 'negativeInteger' && number > -1) return false
	if (builtin === 'nonPositiveInteger' && number > 0) return false
	return (
		(facets.minInclusive === undefined || number >= Number(facets.minInclusive)) &&
		(facets.maxInclusive === undefined || number <= Number(facets.maxInclusive)) &&
		(facets.minExclusive === undefined || number > Number(facets.minExclusive)) &&
		(facets.maxExclusive === undefined || number < Number(facets.maxExclusive))
	)
}

/** Whole numbers from the lowest the built-in type and the range allow, counting away from zero's side of it. */
function numberValues(params: {
	builtin: string
	facets: Facets | undefined
	limit: number
}): string[] {
	const { builtin, facets, limit } = params
	let start = Number(BUILTIN_SAMPLES[builtin] ?? '0')
	if (facets?.minInclusive !== undefined)
		start = Math.max(start, Math.ceil(Number(facets.minInclusive)))
	if (facets?.minExclusive !== undefined)
		start = Math.max(start, Math.floor(Number(facets.minExclusive)) + 1)
	const step = start < 0 ? -1 : 1
	return Array.from({ length: limit }, (_, index) => String(start + index * step))
}

/** The tag name, then the tag name numbered, each cut or padded to the lengths the facets allow. */
function textValues(params: {
	tagName: string
	facets: Facets | undefined
	limit: number
}): string[] {
	const { tagName, facets, limit } = params
	const longest = facets?.length ?? facets?.maxLength
	const shortest = facets?.length ?? facets?.minLength ?? 0
	return Array.from({ length: limit }, function textVariant(_, index): string {
		const suffix = index === 0 ? '' : String(index)
		const kept =
			longest === undefined ? tagName : tagName.slice(0, Math.max(0, longest - suffix.length))
		return `${kept}${suffix}`.padEnd(shortest, 'a')
	})
}
