import type { CardLine, Removal } from '../events/cards-log.types.ts'
import type { StoreEntry } from '../handover/handover.types.ts'
import type { HostAdapter } from '../host/host.types.ts'
import type { LostCommit } from '../landing/lost-work.types.ts'
import type { SettledLot } from '../landing/lot-landing.types.ts'
import type { RunEntry } from '../mutation/mutation.types.ts'
import type { LotItems } from '../store/lot-items.types.ts'
import type { LotIdentity, LotStateName } from '../store/store.types.ts'
import type { FolderLink, ListedWorktree, ProcessFolder } from '../worktree/worktree.types.ts'
import type { ThrowawayProof } from './throwaway-proof.types.ts'

/** What `lot prune` reads before it decides anything: per repository, read once. */
export type LotPruneFacts = { repositories: RepositoryFacts[] }

/**
 * One repository's facts: its main checkout, base branch, the branch its main checkout is on, whether the processes
 * are known (why not), every branch something else holds, and each lot the run reaches.
 */
export type RepositoryFacts = {
	main: string
	baseBranch: string
	/** The ref merged work is compared with (the base branch where it is newest); undefined when none resolves. */
	baseRef?: string
	mainBranch: string | undefined
	/** `known`, or why the processes could not be listed (then no worktree nor throwaway goes). */
	processes: 'known' | string
	holders: BranchHolders
	/** The worktrees a removal left in the trash (its proof failed there), by real trashed path: why each stays. */
	leftInTrash?: ReadonlyMap<string, string>
	lots: LotFacts[]
}

/** The branches something other than a terminal lot holds, each with what holds it. */
export type BranchHolders = {
	/** An open lot's own branch: its reason `lot <name> <state>`. */
	openLots: ReadonlyMap<string, string>
	/** A branch an open lot's `stack.json` names as its parent's: the child's name and state. */
	stackParents: ReadonlyMap<string, string>
	/** The open lots whose `stack.json` is damaged: their parent is not known. */
	damagedStacks: readonly string[]
	/** The branches a stash was made on. */
	stashes: ReadonlySet<string>
	/** Why the stashes could not be read: every branch is then kept, any of them may hold one. */
	stashesUnread?: string
	/** A branch a pending hand-over commits on: the hand-over's name. */
	pendingHandovers: ReadonlyMap<string, string>
	/** A branch a registered worktree has checked out (parked ones left out): that worktree's path. */
	checkedOut: ReadonlyMap<string, string>
}

/** One lot as `lot prune` reads it. */
export type LotFacts = {
	lot: string
	lotFolder: string
	/** Its state, or `damaged` (its records do not read). */
	state: LotStateName | 'damaged'
	/** Why its records do not read, for a damaged lot. */
	damage?: string
	simulated: boolean
	/** Its landing settled once for the run (read with the host when given). */
	settled: SettledLot
	/** Its own worktree, when its identity names one that is still registered. */
	worktree: WorktreeFacts | undefined
	/** Its identity names a worktree that is gone from disk and from git. */
	worktreeGone: boolean
	throwaways: ThrowawayFacts[]
	branches: BranchFacts[]
	/** Its landed tip, when git's garbage collection pruned that commit: named, never handed to git. */
	landedTipGone?: string
	/** Why the lot is kept on purpose (`keptByDecision`): every item of it kept with this text (KEEP 3.5.2). */
	kept?: string
}

/** A lot's worktree and what `lot close`'s own rules decide for it (`decideCloseTargets`): it may close, or why not. */
export type WorktreeFacts = { path: string; closes: true } | { path: string; kept: string }

/**
 * A review throwaway a lot recorded (`throwaway-add`), or a hand-made one matched to it: its worktree, its branch, and
 * why it is not the lot's (`notMatched`), or why the common keep rules keep it, or its proof.
 */
export type ThrowawayFacts = {
	path: string
	branch: string | undefined
	handMade: boolean
	decision: { notMatched: string } | { kept: string } | ThrowawayProof
}

/**
 * A branch of the lot (its own, or a throwaway's): its tip, the commits deleting it with the run's other branches
 * would lose, the commits it holds since its lot's landing.
 */
export type BranchFacts = {
	branch: string
	tip: string
	own: boolean
	lost: readonly LostCommit[]
	sinceLanding: readonly string[]
	/** Why a branch named in a `removing` line is not the throwaway's any more (recreated at another tip). */
	notMatched?: string
	/** Why the commits it reaches could not be read: it is kept, its deletion's loss not known. */
	unread?: string
}

/** The commits deleting a branch would lose, or why the commits it reaches could not be read. */
export type BranchLoss = { lost: readonly LostCommit[]; unread?: string }

/** What a repository's lots share, read once for the run. */
export type PruneReads = {
	main: string
	baseBranch: string
	/** The ref merged work is compared with; undefined when no base branch resolves. */
	baseRef: string | undefined
	mainBranch: string | undefined
	worktrees: readonly ListedWorktree[]
	entries: readonly StoreEntry[]
	cardsLog: string
	cards: readonly CardLine[]
	removals: readonly Removal[]
	/** What the store's lots hold (`readLotItems`), the lots this run settled read with their settled state. */
	lotItems: LotItems
	processes: readonly ProcessFolder[] | string
	links: readonly FolderLink[]
	runs: readonly RunEntry[]
	leftInTrash: ReadonlyMap<string, LeftInTrash>
	holders: BranchHolders
	host: HostAdapter | undefined
	now: Date
	runFrom: string
	listProcesses: (() => ProcessFolder[] | string) | undefined
	scratchRoots: readonly string[] | undefined
}

/** What a worktree's common keep rules read: read once for the plan, again right before a throwaway moves. */
export type KeepReads = Pick<PruneReads, 'runFrom' | 'processes' | 'runs' | 'links' | 'entries'>

/** A branch a lot may lose: its tip, whether it is the lot's own, and why it is not the lot's when a name alone matched. */
export type CandidateBranch = { branch: string; tip: string; own: boolean; notMatched?: string }

/** A throwaway a step recorded: where it is registered now, its branch, and whether its folder is gone. */
export type RecordedThrowaway = {
	path: string
	branch: string | undefined
	listed: ListedWorktree | undefined
	gone: boolean
	/** Why a removal left it in the trash, when it is registered there now. */
	left?: string
}

/** A worktree a removal left in the trash (its proof failed there): where it was, and why it stays. */
export type LeftInTrash = { path: string; reason: string }

/** One lot's records as the run read them, and its landing settled once. */
export type ReadLot = {
	lot: string
	lotFolder: string
	identity: LotIdentity | undefined
	state: LotStateName | 'damaged'
	damage: string | undefined
	simulated: boolean
	settled: SettledLot
	/** Its landed tip, when that commit is still in the repository. */
	landedTip: string | undefined
	/** Its landed tip, when git's garbage collection pruned that commit. */
	landedTipGone: string | undefined
	/** Why the lot is kept on purpose (`keptByDecision`), damaged or not; absent when it is not kept (KEEP 3.5.2). */
	kept?: string
}
