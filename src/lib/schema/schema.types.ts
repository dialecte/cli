/**
 * The part of a dialecte's config and of core's readers `dialecte schema` uses, as structural types: the cli
 * does not depend on `@dialecte/core`, it imports the core each dialecte resolves.
 */

/** A simple value's type, as the generated definition writes it. */
export type SchemaDataType = {
	readonly builtin?: string
	readonly list?: SchemaDataType
	readonly union?: readonly SchemaDataType[]
	readonly facets?: { readonly enumeration?: readonly string[] }
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
	readonly textContent?: { readonly type?: SchemaDataType }
}

/** A dialecte's config, found by its shape: an export holding `rootElementName` and `definition`. */
export type SchemaConfig = {
	readonly rootElementName: string
	readonly elements: readonly string[]
	readonly children: Readonly<Record<string, readonly string[]>>
	readonly definition: Readonly<Record<string, SchemaElementDefinition>>
}

/** The record core's readers resolve a definition for: a tag at the top, no parent, no attribute. */
export type SchemaRecord = {
	readonly tagName: string
	readonly parent: null
	readonly attributes: readonly []
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
