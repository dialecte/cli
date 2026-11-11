/** What kind of work a plan entry is: a reviewed change, a light one, plan files only, or a person's own work. */
export type PlanEntryKind = 'lot' | 'fix' | 'spec' | 'person'

/** The extra heavy steps an entry declares beyond the whole-suite runs every lot makes. */
export type PlanHeavyKind = 'mutation' | 'browser' | 'release'

/**
 * One entry of the lot block. `spec`, `brief` and `match.handover` are absolute (resolved against the plan's
 * folder); scope entries are normalised, `"."` kept as `"."`.
 */
export type PlanEntry = {
	id: string
	group?: string
	title: string
	kind: PlanEntryKind
	dependsOn: string[]
	spec?: string
	scope: Record<string, string[]>
	heavy: PlanHeavyKind[]
	brief?: string
	match?: { branch: string; handover?: string; feature?: string }
	parked?: string
}

/** The lot block of a plan, repositories as absolute paths. */
export type PlanBlock = {
	schema: 1
	repositories: Record<string, string>
	shared: Record<string, string[]>
	lots: PlanEntry[]
}

/** One refusal of the block: where (`lots[3].dependOn`, `repositories.cli`, `block`) and why. */
export type PlanFault = { at: string; detail: string }

/** Where the block was read from. */
export type PlanBlockSource = { kind: 'fence' | 'sidecar'; path: string }

/** The block read from a plan, or every fault found. */
export type PlanBlockRead = { block: PlanBlock; source: PlanBlockSource } | { faults: PlanFault[] }
