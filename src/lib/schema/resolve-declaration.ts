import type { DeclarationResolution, Definition } from './schema.types.ts'

/**
 * Which declaration of a tag applies under a parent: a tag declared once is resolved; a tag declared several ways
 * takes the one its parent holds in a single namespace; otherwise it stays unresolved (the tag level, the union).
 * Undefined for a tag the definition does not hold.
 *
 * @intent know whether a tag's declaration is decided under a parent, pick the declaration an element follows
 */
export function resolveDeclaration(params: {
	definition: Definition
	tagName: string
	parent?: string
}): DeclarationResolution | undefined {
	const tagLevel = params.definition[params.tagName]
	if (tagLevel === undefined) return undefined
	const declarations = tagLevel.declarations
	if (declarations === undefined) return { declarations: 1, resolved: true, id: undefined }
	const id = singleHeldId({
		definition: params.definition,
		tagName: params.tagName,
		parent: params.parent,
	})
	const known = id !== undefined && declarations[id] !== undefined
	return {
		declarations: Object.keys(declarations).length,
		resolved: known,
		id: known ? id : undefined,
	}
}

/** The keys of the tag's declarations a parent holds, in every namespace it holds the tag in, each once. */
export function heldDeclarationIds(params: {
	definition: Definition
	tagName: string
	parent: string | undefined
}): string[] {
	const held = heldByNamespace(params)
	return held === undefined ? [] : [...new Set(Object.values(held).flat())]
}

/** The tag-level parents that hold one declaration of the tag, in the tag level's order. */
export function declarationParents(params: {
	definition: Definition
	tagName: string
	id: string
}): string[] {
	const { definition, tagName, id } = params
	return (definition[tagName]?.parents ?? []).filter(function holdsDeclaration(
		parent: string,
	): boolean {
		return heldDeclarationIds({ definition, tagName, parent }).includes(id)
	})
}

/** The one declaration key the parent holds, when it holds the tag in one namespace with one key. */
function singleHeldId(params: {
	definition: Definition
	tagName: string
	parent: string | undefined
}): string | undefined {
	const held = heldByNamespace(params)
	if (held === undefined) return undefined
	const namespaces = Object.keys(held)
	if (namespaces.length !== 1) return undefined
	const ids = held[namespaces[0]]
	return ids?.length === 1 ? ids[0] : undefined
}

/** What the parent's particles hold of the tag, per namespace; undefined when the parent names no declaration. */
function heldByNamespace(params: {
	definition: Definition
	tagName: string
	parent: string | undefined
}): Readonly<Record<string, readonly string[]>> | undefined {
	if (params.parent === undefined) return undefined
	return params.definition[params.parent]?.children.details[params.tagName]?.declarations
}
