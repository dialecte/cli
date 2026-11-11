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
	/** The standard the dialecte implements (`dialecte.standard` of its package.json); undefined when it names none. */
	standard?: string | undefined
}

/** An attribute of a tag that admits an enumeration value. */
export type AttributeAdmitting = { tag: string; attribute: string }

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
	/**
	 * The declared type's Clark name; undefined when the declaration is anonymous, and on the unresolved union of a
	 * tag declared several ways unless its tag level names one.
	 */
	type: string | undefined
	documentation: string | undefined
	/** The key of the declaration described; undefined for a tag declared once and for the unresolved union. */
	declaration: string | undefined
	/** How many ways the schema declares the tag (1 when declared once). */
	declarations: number
	/** The description is of the one declaration that applies; false when it is the tag level (the union). */
	resolved: boolean
}

/**
 * What `dialecte schema <Tag>` answers from one dialecte: the element (the declaration that applies, or the tag
 * level, its `declaration` the key of the one described), and the declarations left open when the parent does
 * not decide.
 */
export type SchemaAnswer = {
	element: ElementDescription
	/** The declarations the answer lists: empty when resolved. */
	ways: DeclarationDescription[]
	/** The parent given with `--under`. */
	under: string | undefined
}

/** An element of `dialecte schema --json`: its description, with its declarations (`ways`) when unresolved. */
export type SchemaJsonElement = ElementDescription & { ways?: DeclarationDescription[] }

/** A dialecte's element definitions, by tag. */
export type Definition = AnyDialecteConfig['definition']

/** Which declaration of a tag applies under a parent: how many there are, whether one is decided, its key. */
export type DeclarationResolution = {
	declarations: number
	resolved: boolean
	/** The key of the declaration that applies; undefined for a tag declared once or when unresolved. */
	id: string | undefined
}

/** One way a tag is declared: its key, the parents that hold it, whether it is global, what it describes. */
export type DeclarationDescription = {
	id: string
	parents: readonly string[]
	global: boolean
	element: ElementDescription
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
	/** The package's own dialecte facts, as written (any JSON); `standard` is read as a non-empty string. */
	dialecte?: unknown
	exports?: string | Record<string, ExportTarget>
	dependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
}
