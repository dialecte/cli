import type { AttributeAdmitting, LoadedDialecte } from './schema.types.ts'
import type { AnyTypes, ContentDefinition, DeclarationDefinition } from '@dialecte/core'

/**
 * Every attribute that admits an enumeration value, exactly as given (case kept): over the tag levels, the
 * declarations and the types they name (`type`, `variants`); deduplicated, sorted by tag then attribute.
 *
 * @intent find which attributes admit a value, tell where an enumeration value is used
 */
export function attributesAdmitting(params: {
	dialecte: LoadedDialecte
	value: string
}): AttributeAdmitting[] {
	const { dialecte, value } = params
	const { definition, types } = dialecte.config
	const found = new Map<string, AttributeAdmitting>()
	for (const [tag, tagLevel] of Object.entries(definition)) {
		const ways: DeclarationDefinition[] = [tagLevel, ...Object.values(tagLevel.declarations ?? {})]
		for (const content of ways.flatMap((way) => [way, ...namedTypes({ way, types })]))
			for (const [attribute, rule] of Object.entries(content.attributes.details))
				if (dialecte.readers.enumeratedValues(rule.type).includes(value))
					found.set(JSON.stringify([tag, attribute]), { tag, attribute })
	}
	return [...found.values()].sort(byTagThenAttribute)
}

/** The types a tag level or declaration names (its declared type and its xsi:type variants) the dialecte holds. */
function namedTypes(params: { way: DeclarationDefinition; types: AnyTypes }): ContentDefinition[] {
	const { way, types } = params
	const names = [...(way.type === undefined ? [] : [way.type]), ...(way.variants ?? [])]
	return names.flatMap((name) => types[name] ?? [])
}

/** By tag, then attribute, compared by code unit (never by locale). */
function byTagThenAttribute(first: AttributeAdmitting, second: AttributeAdmitting): number {
	return (
		compareCodeUnits(first.tag, second.tag) || compareCodeUnits(first.attribute, second.attribute)
	)
}

function compareCodeUnits(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}
