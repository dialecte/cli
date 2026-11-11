import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** The ways a lot of a store is damaged by a hand, each the cause of one reason. */
export type DamageKind =
	| 'identityMissing'
	| 'identityUnparsable'
	| 'identityOtherName'
	| 'identityIndex'
	| 'badTransition'
	| 'strayAnswer'
	| 'unknownEntryState'

/** How the brief of a damaged lot reads: the scope as a list, or why not. */
export type BriefDamage = 'missing' | 'unparsable' | 'scopeNotList'

/** A row of the damage table: what was done to the lot and the reason its readers give. */
export type DamageRow = {
	kind: DamageKind
	title: string
	reason: string
}

/** A row of the brief table: what was done to `brief.json` of a lot whose identity is missing. */
export type BriefRow = { kind: BriefDamage; title: string }

/** A damaged lot written into a start workspace's store. */
export type DamagedLot = {
	start: StartWorkspace
	name: string
	/** The real path of its folder. */
	lotFolder: string
	/** The reason its readers give. */
	reason: string
}
