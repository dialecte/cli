import type { AnyDialecteConfig } from '@dialecte/core'
import type {
	ChildOccurrences,
	enumeratedValues,
	getAttributeRules,
	orderByConfigSequence,
	resolveDefinition,
	valuePatterns,
	admittedXsiTypes,
	childOccurrences,
} from '@dialecte/core/utils'

/**
 * Core's own definition readers (`@dialecte/core/utils`), typed by the core the cli is built against (type-only
 * imports: the cli loads at run time the core each dialecte resolves, and checks with `isCoreReaders` that it
 * holds them). A dialecte on an older core may lack one: the runtime check reports which.
 */
export type CoreReaders = {
	resolveDefinition: typeof resolveDefinition
	getAttributeRules: typeof getAttributeRules
	enumeratedValues: typeof enumeratedValues
	valuePatterns: typeof valuePatterns
	admittedXsiTypes: typeof admittedXsiTypes
	childOccurrences: typeof childOccurrences
	orderByConfigSequence: typeof orderByConfigSequence
}

/** An installed dialecte, its config and the readers of the core it depends on. */
export type LoadedDialecte = {
	packageName: string
	config: AnyDialecteConfig
	readers: CoreReaders
}

export type ChildDescription = { tag: string } & ChildOccurrences

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
	version?: string
	main?: string
	exports?: string | Record<string, ExportTarget>
	dependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
}
