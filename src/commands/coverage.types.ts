import type { AttributeDefinition } from '@dialecte/core'

/** An attribute's definition, as core's generated definition writes it. */
export type AttributeDetail = AttributeDefinition
/** The part of an element's definition coverage reads; loose (every member optional) so a dialecte on another core still reads. */
export type ElementDef = { attributes?: { details?: Record<string, AttributeDetail> } }
export type DialecteSchema = {
	elements: readonly string[]
	children: Record<string, readonly string[]>
	singletons: readonly string[]
	definition: Record<string, ElementDef>
	/** Optional — present when the dialect's constants export ROOT_ELEMENT. */
	root?: string
}

/** What `generateTargetCoverage` did: the probes it wrote, and why method discovery failed when it did. */
export type TargetCoverage = {
	/** The absolute paths of the probes written. */
	written: string[]
	/** The line saying what was generated: its elements, its child edges and the folder. */
	summary: string
	/** Method discovery's failure: the `coverage.api` probe was not written. */
	discoveryFailure?: string
}
