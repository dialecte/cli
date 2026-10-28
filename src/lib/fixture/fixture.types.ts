/**
 * The shapes `dialecte fixture` plans and builds: which elements to add under which, which required
 * attributes and text to give which value. The plan is read from the dialecte's definition through core's
 * readers; the engine builds it.
 */
import type { ElementRef } from '../run/run.types.ts'
import type {
	CoreReaders,
	LoadedDialecte,
	Occurrences,
	SchemaElementDefinition,
	SchemaRecord,
} from '../schema/schema.types.ts'

/** A required attribute and the valid value the fixture gives it when the engine and the hooks left it empty. */
export type FixtureAttribute = { name: string; value: string }

/** An element of the fixture: its required attributes and text, then the children added under it, in sequence order. */
export type FixtureElement = {
	tagName: string
	/** The variant an element of an abstract type names, as a Clark name (`{uri}local`). */
	xsiType?: string
	attributes: FixtureAttribute[]
	/** The element's text, when its type does not admit an empty one. */
	text?: string
	children: FixtureElement[]
}

/** What the engine builds: the root's attributes and its subtree, the chain to the asked element included. */
export type FixturePlan = {
	tagName: string
	/** The tags from the root down to the asked element, both included. */
	chain: string[]
	root: FixtureElement
}

/**
 * The plan, or why there is none: an unknown tag, a `--under` step that does not hold the next, a value no
 * sample makes, a reference the fixture cannot satisfy.
 */
export type FixturePlanResult = { plan: FixturePlan } | { problem: string }

/** A value for an attribute, or why none could be made. */
export type SampleResult = { value: string } | { problem: string }

/** The valid values of a type, best first, or why there is none. */
export type ValuesResult = { values: string[] } | { problem: string }

/** A choice a content model requires, as core's `requiredChoices` reads it. */
export type RequiredChoice = {
	readonly min: number
	readonly branches: readonly ChoiceBranch[]
}

/** One branch of a required choice: how often it holds each child, and the choices it requires in turn. */
export type ChoiceBranch = {
	readonly children: Readonly<Record<string, Occurrences>>
	readonly choices: readonly RequiredChoice[]
}

/** Core's readers the fixture plans with: the schema readers and the required choices of a content model. */
export type FixtureReaders = CoreReaders & {
	requiredChoices(params: { definition: SchemaElementDefinition }): readonly RequiredChoice[]
}

/** A dialecte as the fixture plans it: its config and its core's readers. */
export type FixtureDialecte = Omit<LoadedDialecte, 'readers'> & { readers: FixtureReaders }

/** An element while the plan is made: what is planned for it so far, and the definition it was read from. */
export type PlanNode = {
	tagName: string
	xsiType?: string
	record: SchemaRecord
	definition: SchemaElementDefinition
	/** Planned attribute values by name, in the order they were planned. */
	attributes: Map<string, string>
	text?: string
	children: PlanNode[]
}

/** What every step of planning shares: the dialecte, and every value sampled so far (each sampled value is new). */
export type PlanContext = {
	dialecte: FixtureDialecte
	used: Set<string>
}

/** A pattern read as a tree, enough to write strings it matches. */
export type PatternNode =
	| { kind: 'literal'; character: string }
	/** One character a class, an escape or `.` admits: its source, tested against candidate characters. */
	| { kind: 'characterSet'; source: string }
	| { kind: 'sequence'; items: PatternNode[] }
	| { kind: 'alternation'; branches: PatternNode[] }
	| { kind: 'repeat'; node: PatternNode; min: number; max: number | undefined }

/** Where the pattern reader stands in the source. */
export type PatternCursor = { source: string; position: number }

/** What a field of an identity constraint reads on the element its selector reaches. */
export type FieldReader = { attribute: string } | { text: true }

/** The part of a transaction the fixture calls: add an element, read and fill its attributes. */
export type FixtureTransaction = {
	addChild(
		parent: ElementRef,
		params: { tagName: string; attributes: Record<string, string>; value?: string },
	): Promise<ElementRef>
	getAttribute(ref: ElementRef, params: { name: string; defaults: 'none' }): Promise<unknown>
	update(ref: ElementRef, params: { attributes: Record<string, string> }): Promise<unknown>
}

/** The part of a query the fixture calls. */
export type FixtureQuery = {
	getRoot(): Promise<ElementRef>
}
