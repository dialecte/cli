import type { CardLine } from '../events/cards-log.types.ts'
import type { BaseBranchRef } from '../gate/gate-base.types.ts'
import type { StoreEntry } from '../handover/handover.types.ts'
import type { LotIdentity, LotStateName } from '../store/store.types.ts'
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
 * One store lot's landing as every verb that closes or prunes settles it, once per run (`settleLotLanding`): not read
 * (no store records, damaged, its identity or base not reading, a landed fact that could not be written), landed (its
 * fact, recorded once merged), canceled (nothing of it lands: its landing is not read), committed but not landed (why),
 * or open with its state and why it is not landed.
 */
export type SettledLot =
	| { notRead: string }
	| { landed: LandedFact }
	| { canceled: true }
	| { notLanded: string }
	| { open: Exclude<LotStateName, 'committed' | 'canceled'>; why: string }

/**
 * Where a stale lot's tip is read when its branch and worktree are gone: the repository's `cards.log`
 * cards and its registry entries, read once per command.
 */
export type RecordedTips = { cards: readonly CardLine[]; entries: readonly StoreEntry[] }
