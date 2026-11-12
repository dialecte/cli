import type { PlanStates } from './entry-state.types.ts'
import type { PlanBlock } from './plan-block.types.ts'
import type { PlanFacts, SpecStatusName } from './plan.types.ts'

/** A heavy step running now: its step, the folder of its worktree, when it started, the plan entry it belongs to. */
export type PlanHeavyMarker = {
	/** The marker's step: `gate-full`, `mutation`, `gate-fast: <part>`... */
	step: string
	/** The folder name of the marker's worktree (`0016-cli-events-report-l0`). */
	worktree: string
	/** ISO time the step started. */
	since: string
	/** The entry of the worktree's branch (the block's attribution), else null. */
	entry: string | null
}

/**
 * What runs on the machine now: the live heavy markers, in the order they started, and why the machine is short
 * (none when it is not, or when the reading was not made).
 */
export type PlanHeavyReading = {
	markers: PlanHeavyMarker[]
	shortReasons?: string[]
	/** Why the markers could not be read (the state folder is damaged); left out when they were. */
	markersUnknown?: string
}

/** The counts line: `ready` includes the held ones. */
export type PlanCounts = {
	done: number
	open: number
	ready: number
	held: number
	waiting: number
	parked: number
	unknown: number
}

/** A lot or fix that can start now. */
export type Proposal = {
	id: string
	kind: 'lot' | 'fix'
	unblocks: number
	chain: number
	after: string | null
	merge: string[]
	unverified: string[]
	heavy: string[]
	/** Live heavy steps of the same kind: `mutation (running in <worktree> since <hh:mm>)`. */
	stacks: string[]
	/** Said only when the machine is short: `the machine is short now (<reasons>): its heavy steps would wait (section 8)`. */
	wait?: string
	next: string
}

/** A ready lot held back by open lots: every open lot met, and each pair of scope entries. */
export type Held = { id: string; open: string[]; met: string[] }

/** Spec work: one line per spec file, with the entries that need it. */
export type SpecWork = { ids: string[]; file: string; status: SpecStatusName }

/** What `plan next` proposes. */
export type PlanProposals = {
	counts: PlanCounts
	proposals: Proposal[]
	held: Held[]
	specWork: SpecWork[]
}

/**
 * An open lot of a repository a candidate is checked against: an open entry (its held scope; `manual` when open by
 * its worktree alone) or an open store lot outside the plan (its brief scope).
 */
export type PlanOpenLot = { repository: string; name: string; scope: string[]; manual: boolean }

/** Where an entry stands on the critical path: entries not done behind it, and the longest chain of them. */
export type PlanRank = { unblocks: number; chain: number }

/** The arguments of `proposePlan`. */
export type ProposePlanParams = {
	block: PlanBlock
	facts: PlanFacts
	states: PlanStates
	heavy: PlanHeavyReading
}
