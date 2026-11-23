import type { LandingEvidence } from './landing-state.types.ts'

/**
 * `landed.json` in a lot's folder: the fact that the lot merged, written once by a verb that acts (land, close, prune)
 * when it reads the landing state `merged`. A merge is final: the fact never goes stale.
 */
export type LandedFact = {
	schema: number
	how: LandingEvidence
	/** The lot's tip that landed (or the merged change request's head). */
	tip: string
	/** The base branch it landed on, its short name. */
	base: string
	/** The change request it landed through, when one is known. */
	changeRequest?: { number: number; url: string }
	/** When the fact was written (ISO). */
	at: string
}

/** A `landed.json` that does not read as a fact: why. */
export type LandedDamage = { damage: string }
