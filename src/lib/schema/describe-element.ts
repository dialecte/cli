/**
 * `dialecte schema <Tag>`: what an element may hold and where, read through core's own readers from the
 * dialecte's config - parents, children in sequence order with how often each may appear, attributes
 * (required, default, fixed, enumeration, pattern), text, xsi:type variants.
 */
import type {
	AttributeDescription,
	ElementDescription,
	LoadedDialecte,
	SchemaDataType,
	SchemaRecord,
} from './schema.types.ts'

export function describeElement(params: {
	dialecte: LoadedDialecte
	tagName: string
}): ElementDescription | undefined {
	const { config, readers, packageName } = params.dialecte
	const record: SchemaRecord = { tagName: params.tagName, parent: null, attributes: [] }
	const definition = config.elements.includes(params.tagName)
		? readers.resolveDefinition({ dialecteConfig: config, record })
		: undefined
	if (definition === undefined) return undefined

	const occurrences = readers.childOccurrences({ definition })
	const children = readers
		.orderByConfigSequence({
			parentTagName: definition.tag,
			children: definition.children.sequence.map((tagName) => ({ tagName })),
			childrenConfig: config.children,
		})
		.map(({ tagName }) => ({ tag: tagName, ...occurrences[tagName] }))

	return {
		packageName,
		tag: definition.tag,
		namespace: definition.namespace.uri,
		parents: definition.parents,
		children,
		anyChild: definition.children.any === true,
		attributes: definition.attributes.sequence.map(function describeAttribute(
			attributeName: string,
		): AttributeDescription {
			const rules = readers.getAttributeRules({ dialecteConfig: config, record, attributeName })
			const datatype = definition.attributes.details[attributeName]?.type
			return {
				name: attributeName,
				required: rules.isRequired,
				identityField: rules.isIdentityField,
				default: rules.default,
				fixed: rules.fixed,
				namespace: rules.namespace?.uri,
				type: typeName(datatype),
				enumeration: readers.enumeratedValues(datatype),
				patterns: readers.valuePatterns(datatype).map((pattern) => pattern.source),
			}
		}),
		text: definition.textContent ? (typeName(definition.textContent.type) ?? 'string') : undefined,
		xsiTypes: readers.admittedXsiTypes({ dialecteConfig: config, record }),
	}
}

/** The built-in a datatype restricts, `list` or `union`; undefined for an untyped (plain string) value. */
function typeName(datatype: SchemaDataType | undefined): string | undefined {
	if (datatype === undefined) return undefined
	if (datatype.builtin !== undefined) return datatype.builtin
	return datatype.list !== undefined ? 'list' : 'union'
}
