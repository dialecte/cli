/** A value's datatype as the definition writes it: a built-in, a list, a union, with the facets restrictions add. */
export type DataTypeDetail = {
	builtin?: string
	list?: DataTypeDetail
	union?: readonly DataTypeDetail[]
	facets?: { enumeration?: readonly string[] }
}
export type AttributeDetail = {
	required?: boolean
	fixed?: string
	type?: DataTypeDetail
}
export type ElementDef = { attributes?: { details?: Record<string, AttributeDetail> } }
export type DialecteSchema = {
	elements: readonly string[]
	children: Record<string, readonly string[]>
	singletons: readonly string[]
	definition: Record<string, ElementDef>
	/** Optional — present when the dialect's constants export ROOT_ELEMENT. */
	root?: string
}
