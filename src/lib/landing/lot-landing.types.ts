import type { BaseBranchRef } from '../gate/gate-base.types.ts'
import type { LotIdentity } from '../store/store.types.ts'
import type { LandedFact } from './landed-record.types.ts'
import type { LandingState } from './landing-state.types.ts'

/**
 * A store lot as the verbs that act on its landing read it: its folder, identity, the repository and base it lands on,
 * its landing state (from its landed fact when it holds one, else `readLandingState`), and that fact.
 */
export type LotLanding = {
	lot: string
	lotFolder: string
	identity: LotIdentity
	/** The repository the lot's refs are read in. */
	root: string
	base: BaseBranchRef
	state: LandingState
	/** The landed fact the lot's folder already holds. */
	recorded?: LandedFact
}

/**
 * What `lot status` reads beyond the lot's files, handed in by its caller (the status module starts no process): the
 * lot's landing as git alone reads it (the merged tip, never written), and the stack line of a stacked lot, its parent
 * read through the one lot reader with the host.
 */
export type StatusLanding = {
	mergedTipOf: (params: { lotFolder: string }) => string | undefined
	stackLineOf: (params: { lotFolder: string }) => string | undefined
}

/**
 * What `lot close` settled before deciding: the names it closes (a merged lot with no entry named by the entry it got),
 * the line of each argument whose lot landed, and the arguments kept with why (a lot not merged), by argument.
 */
export type CloseLandings = {
	names: string[]
	landed: ReadonlyMap<string, string>
	kept: ReadonlyMap<string, string>
}

/**
 * A store lot's worktree as `worktree prune` reads its landing, git alone: whether the lot landed (and the tip that
 * landed), or why it stays beyond its lot keep reason (work after a landing, a landing git cannot prove).
 */
export type PruneLotLanding = {
	lot: string
	landed: boolean
	/** A lot no longer at work (committed in the registry, or canceled): its throwaways go through the work check. */
	closed?: boolean
	landedTip?: string
	reason?: string
}
