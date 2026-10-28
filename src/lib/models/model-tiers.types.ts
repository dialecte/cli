import type { TIER_NAMES, VENDOR_IDS } from './model-tiers.constants.ts'

export type ModelTierName = (typeof TIER_NAMES)[number]

/** A vendor family the tier map has a row for. */
export type VendorId = (typeof VENDOR_IDS)[number]

export type TierModel = {
	model: string
	effort?: string
}

export type VendorModels = {
	note?: string
	tiers: Record<ModelTierName, TierModel>
}

export type ModelTierMap = {
	/** ISO date the rows were last checked against the vendors' model pages. */
	checkedAt: string
	vendors: Record<VendorId, VendorModels>
}

/** An agent a project can be set up for. */
export type VendorHost = {
	agent: string
	/** Alternatives; an alternative holds when all its paths exist. */
	anyOf: readonly (readonly string[])[]
} & ({ vendor: VendorId } | { multiVendor: true })

/** What the project folder says about the vendor. */
export type VendorDetection =
	| { kind: 'one'; vendor: VendorId; agent: string }
	| { kind: 'choose'; candidates: VendorId[] }
	| { kind: 'none' }

/** What `skills sync` does about the vendor. */
export type SyncVendorResolution =
	| { kind: 'set'; vendor: VendorId }
	| { kind: 'ask'; candidates: VendorId[] }
	/** A manifest already exists: the sync goes on without a vendor and says how to set it. */
	| { kind: 'unset'; notice: string }
	| { kind: 'fail'; output: string }

/** The vendor the skills manifests remember, and what was odd about them. */
export type RememberedVendor = {
	vendor: VendorId | undefined
	/** One line each: an unknown id ignored, manifests that disagree. */
	warnings: string[]
}

/** What `skills sync` settles about the vendor before it installs. */
export type VendorChoice = {
	/** To remember; undefined when the sync goes on without one (or stops). */
	vendor: VendorId | undefined
	/** Lines for stderr. */
	output: string
	/** 2: nothing may be installed. */
	exitCode: 0 | 2
}
