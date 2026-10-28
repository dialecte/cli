/**
 * The part of a dialecte's config and of core's readers `dialecte schema` uses, as structural types: the cli
 * does not depend on `@dialecte/core`, it imports the core each dialecte resolves.
 */

/** A simple value's type, as the generated definition writes it. */
export type SchemaDataType = {
	readonly builtin?: string
	readonly list?: SchemaDataType
	readonly union?: readonly SchemaDataType[]
	readonly facets?: SchemaFacets
}

/** The facets a restriction adds, as the generated definition writes them (ranges as written in the schema). */
export type SchemaFacets = {
	readonly enumeration?: readonly string[]
	/** One list per restriction level, as the definition writes them: a value matches one of each level. */
	readonly pattern?: readonly (readonly string[])[]
	readonly length?: number
	readonly minLength?: number
	readonly maxLength?: number
	readonly minInclusive?: string
	readonly maxInclusive?: string
	readonly minExclusive?: string
	readonly maxExclusive?: string
}

/** A name test of a selector or field step: an absent name is any element (`*`). */
export type SchemaNameTest = { readonly name?: string; readonly namespace?: string }

/** One alternative of a selector: the steps from the element the constraint is declared on (`[]` = itself). */
export type SchemaSelectorPath = { readonly deep?: true; readonly steps: readonly SchemaNameTest[] }

/** One alternative of a field: the attribute it reads, or without one the text of the element its steps reach. */
export type SchemaFieldPath = SchemaSelectorPath & { readonly attribute?: SchemaNameTest }

/** A unique, key or keyref constraint, as the generated definition writes it on the element declaring it. */
export type SchemaIdentityConstraint = {
	readonly kind: 'unique' | 'key' | 'keyref'
	readonly name: string
	readonly namespace: string
	/** The key or unique a keyref refers to. */
	readonly refer?: { readonly name: string; readonly namespace: string }
	readonly selector: readonly SchemaSelectorPath[]
	/** Each field is a union of paths. */
	readonly fields: readonly (readonly SchemaFieldPath[])[]
}

export type SchemaElementDefinition = {
	readonly tag: string
	readonly parents: readonly string[]
	readonly namespace: { readonly prefix: string; readonly uri: string }
	readonly attributes: {
		readonly sequence: readonly string[]
		readonly details: Readonly<Record<string, { readonly type?: SchemaDataType }>>
	}
	readonly children: { readonly sequence: readonly string[]; readonly any?: true }
	readonly textContent?: {
		readonly type?: SchemaDataType
		readonly default?: string
		readonly fixed?: string
	}
	/** The element's declared type is abstract: a written element names one of its variants with xsi:type. */
	readonly abstractType?: boolean
	/** The unique, key and keyref constraints declared on the element. */
	readonly constraints?: readonly SchemaIdentityConstraint[]
}

/** A dialecte's config, found by its shape: an export holding `rootElementName` and `definition`. */
export type SchemaConfig = {
	readonly rootElementName: string
	readonly elements: readonly string[]
	readonly children: Readonly<Record<string, readonly string[]>>
	readonly definition: Readonly<Record<string, SchemaElementDefinition>>
}

/** The record core's readers resolve a definition for: a tag at the top, no parent, and its xsi:type when it names one. */
export type SchemaRecord = {
	readonly tagName: string
	readonly parent: null
	readonly attributes: readonly SchemaRecordAttribute[]
}

/** An attribute of a record the readers resolve: xsi:type, for the definition of the variant it names. */
export type SchemaRecordAttribute = {
	readonly name: string
	readonly value: string
	readonly namespace: { readonly prefix: string; readonly uri: string }
}

/** Core's own definition readers (`@dialecte/core/utils`), as the dialecte's core exports them. */
export type CoreReaders = {
	resolveDefinition(params: {
		dialecteConfig: SchemaConfig
		record: SchemaRecord
	}): SchemaElementDefinition | undefined
	getAttributeRules(params: {
		dialecteConfig: SchemaConfig
		record: SchemaRecord
		attributeName: string
	}): {
		isRequired: boolean
		isIdentityField: boolean
		fixed: string | undefined
		default: string | undefined
		namespace: { readonly uri: string } | undefined
	}
	enumeratedValues(datatype: SchemaDataType | undefined): readonly string[]
	valuePatterns(datatype: SchemaDataType | undefined): readonly RegExp[]
	admittedXsiTypes(params: {
		dialecteConfig: SchemaConfig
		record: SchemaRecord
	}): readonly string[]
	childOccurrences(params: {
		definition: SchemaElementDefinition
	}): Readonly<Record<string, Occurrences>>
	orderByConfigSequence<GenericNode extends { tagName: string }>(params: {
		parentTagName: string
		children: GenericNode[]
		childrenConfig: Readonly<Record<string, readonly string[]>>
	}): GenericNode[]
}

/** An installed dialecte, its config and the readers of the core it depends on. */
export type LoadedDialecte = {
	packageName: string
	config: SchemaConfig
	readers: CoreReaders
}

/** How often a child may appear: `max` undefined = unbounded. */
export type Occurrences = { min: number; max: number | undefined }

export type ChildDescription = { tag: string } & Occurrences

export type AttributeDescription = {
	name: string
	required: boolean
	identityField: boolean
	default: string | undefined
	fixed: string | undefined
	/** The namespace of a foreign attribute (`xml:lang`); undefined for the element's own. */
	namespace: string | undefined
	type: string | undefined
	enumeration: readonly string[]
	patterns: readonly string[]
}

/** What `dialecte schema <Tag>` answers for one dialecte. */
export type ElementDescription = {
	packageName: string
	tag: string
	namespace: string
	parents: readonly string[]
	children: ChildDescription[]
	/** A wildcard admits elements of other namespaces too. */
	anyChild: boolean
	attributes: AttributeDescription[]
	/** Text content: its type, `string` when untyped; undefined when the element holds no text. */
	text: string | undefined
	xsiTypes: readonly string[]
}

/** The dialectes found from a folder, and the packages built on core that could not be read, with why. */
export type LoadedDialectes = {
	dialectes: LoadedDialecte[]
	skipped: { packageName: string; reason: string }[]
}

/** A package's `exports` value for one subpath: a file, or files by condition. */
export type ExportTarget =
	| string
	| { readonly import?: unknown; readonly default?: unknown; readonly node?: unknown }

export type PackageManifest = {
	name?: string
	main?: string
	exports?: string | Record<string, ExportTarget>
	dependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
}
