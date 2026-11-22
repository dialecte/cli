import type { StoreEntry } from '../handover/handover.types.ts'
import type { LotRecord } from '../store/lot-items.types.ts'
import type { FolderLink, ProcessFolder } from '../worktree/worktree.types.ts'

/** The lot a rehearsal clone belongs to: the lot, its folder (its keep is read there), its main checkout. */
export type CloneOwner = {
	lot: string
	lotFolder: string
	main: string
	/**
	 * Its keep text as read with it (its record's, or read on the spot for a lot outside the reads); undefined when it
	 * is not kept.
	 */
	kept?: string
}

/**
 * What the owner read answers: the owning lot; why the clone could not be read; the lots (`, `-joined) a done entry names
 * when more than one matches it (the clone then stays); undefined for no owner.
 */
export type CloneOwnerRead = CloneOwner | { unread: string } | { notSingle: string } | undefined

/** What an owner decision reads, once per plan and once per execution: the lots and the registry entries. */
export type OwnerReads = {
	lots: readonly LotRecord[]
	entries: readonly StoreEntry[]
}

/**
 * The owner reads indexed once (`ownerLookupsOf`): each lot by its folder as the store names it, the lots by their own
 * worktree's real path and branch, and the registry entries.
 */
export type OwnerLookups = {
	byLotFolder: ReadonlyMap<string, LotRecord>
	byWorktreeBranch: ReadonlyMap<string, readonly LotRecord[]>
	entries: readonly StoreEntry[]
}

/** A clone's marker read once: the hand-over folder it names (none: undefined), or why the clone could not be read. */
export type CloneMarker = { handover: string | undefined } | { unread: string }

/** The facts one clone decision reads: the clone, its owner, the owner's keep, the processes, the links. */
export type CloneFacts = {
	clone: string
	owner: CloneOwnerRead
	/** The owning lot's keep text; undefined when it is not kept. */
	kept: string | undefined
	/** The processes and their working folders; why they are not known (the clone then stays). */
	processes: readonly ProcessFolder[] | string
	/** The links that may reach a clone; why they could not be read (the clone then stays). */
	links: readonly FolderLink[] | string
	/** Reads a pid's start time; default `processStartTime`. */
	readStartTime?: (pid: number) => string | undefined
}

/** Why a clone stays, tagged; each remover renders its own text. */
export type CloneKeep =
	| { tag: 'link'; link: string }
	| { tag: 'unreadable'; reason: string }
	| { tag: 'kept'; kept: string }
	| { tag: 'alive'; pid: number }
	/** `pid`: a running owner whose start time cannot be compared (no start time held, or none read). */
	| { tag: 'unknown'; why: string; pid?: number }
	| { tag: 'process'; pid: number }
