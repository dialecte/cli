/**
 * `dialecte schema <Tag>`: what an element may hold and where, read through core's own readers from the
 * dialecte's config - parents, children in sequence order with how often each may appear, attributes
 * (required, default, fixed, enumeration, pattern), text, xsi:type variants, its type and documentation.
 * A tag declared several ways is described as the declaration its parent decides, else as its tag level.
 */
import { declarationParents, resolveDeclaration } from './resolve-declaration.ts'

import type { AttributeDescription, ElementDescription, LoadedDialecte } from './schema.types.ts'
import type { AnyDialecteConfig, DataType, ElementDefinition } from '@dialecte/core'
import type { ResolvableRecord } from '@dialecte/core/utils'

/**
 * What an element may hold and where: the declaration that applies under `parent`, or the tag level (the union of
 * its declarations) when none is decided. Undefined for a tag the dialecte lacks, or a parent that does not hold it.
 *
 * @intent describe an element of an installed dialecte, tell what an element may hold under a parent
 */
export function describeElement(params: {
	dialecte: LoadedDialecte
	tagName: string
	/** The tag the element sits under; decides which declaration applies when the tag is declared several ways. */
	parent?: string | undefined
}): ElementDescription | undefined {
	const { dialecte, tagName, parent } = params
	const { definition, elements } = dialecte.config
	const tagLevel = definition[tagName]
	if (!elements.includes(tagName) || tagLevel === undefined) return undefined
	if (parent !== undefined && !tagLevel.parents.includes(parent)) return undefined

	const resolution = resolveDeclaration({ definition, tagName, parent })
	if (resolution === undefined) return undefined
	if (resolution.id !== undefined)
		return describeDeclaration({ dialecte, tagName, id: resolution.id })
	return describeDefinition({
		dialecte,
		tagName,
		declaration: undefined,
		declarations: resolution.declarations,
		resolved: resolution.resolved,
	})
}

/**
 * One declaration of a tag declared several ways, described as a tag declared once: core's readers read a view of
 * the config where the tag's entry is that declaration, with the tag level's tag and the parents holding it.
 */
export function describeDeclaration(params: {
	dialecte: LoadedDialecte
	tagName: string
	id: string
}): ElementDescription | undefined {
	const { dialecte, tagName, id } = params
	const declarations = dialecte.config.definition[tagName]?.declarations
	if (declarations?.[id] === undefined) return undefined
	return describeDefinition({
		dialecte: { ...dialecte, config: declarationView({ config: dialecte.config, tagName, id }) },
		tagName,
		declaration: id,
		declarations: Object.keys(declarations).length,
		resolved: true,
	})
}

/** The config with the tag's entry replaced by one of its declarations (its tag-level tag, the parents holding it). */
function declarationView(params: {
	config: AnyDialecteConfig
	tagName: string
	id: string
}): AnyDialecteConfig {
	const { config, tagName, id } = params
	const tagLevel = config.definition[tagName]
	const declaration = tagLevel.declarations?.[id]
	if (declaration === undefined) return config
	const parents = declarationParents({ definition: config.definition, tagName, id })
	const element: ElementDefinition = { ...declaration, tag: tagLevel.tag, parents }
	return { ...config, definition: { ...config.definition, [tagName]: element } }
}

/** The element as core resolves it at the root of the config given: what the readers say it holds. */
function describeDefinition(params: {
	dialecte: LoadedDialecte
	tagName: string
	/** The key of the declaration the config's entry is; undefined for a tag declared once or the tag level. */
	declaration: string | undefined
	declarations: number
	resolved: boolean
}): ElementDescription | undefined {
	const { config, readers, packageName } = params.dialecte
	const record: ResolvableRecord = { tagName: params.tagName, parent: null, attributes: [] }
	const definition = readers.resolveDefinition({ dialecteConfig: config, record })
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
		type: definition.type,
		documentation: definition.documentation,
		declaration: params.declaration,
		declarations: params.declarations,
		resolved: params.resolved,
	}
}

/** The built-in a datatype restricts, `list` or `union`; undefined for an untyped (plain string) value. */
function typeName(datatype: DataType | undefined): string | undefined {
	if (datatype === undefined) return undefined
	if ('builtin' in datatype) return datatype.builtin
	return 'list' in datatype ? 'list' : 'union'
}
