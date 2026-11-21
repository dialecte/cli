import type { FolderLink, ProcessFolder } from '../worktree/worktree.types.ts'

/** The lot a hand-over folder belongs to, for the clones that rehearse it: the lot, its main checkout, its keep. */
export type CloneOwner = {
	lot: string
	/** The lot's folder: its keep is read again at the move. */
	lotFolder: string
	main: string
	/** Why the lot is kept on purpose (`keptByDecision`): its clones are kept with this text. */
	kept?: string
}

/**
 * A rehearsal clone in a scratch root and its decision: its owner when its marker names a hand-over folder of a lot
 * of the feature (none for another hand-over's, or a marker that names none), the trash it goes to, and whether it
 * goes or is kept with why.
 */
export type FeatureClone = {
	clone: string
	trash: string
	owner: CloneOwner | undefined
	decision: { go: true } | { kept: string }
}

/** What became of a clone once the act ran: moved into the trash (where to), or kept (why). */
export type MovedClone = { removed: string } | { kept: string }

/** What every clone decision reads: the owners by hand-over folder, the links, the workspace, the start time reader. */
export type CloneReads = {
	/** The lot each hand-over folder of the feature belongs to, by real path. */
	owners: ReadonlyMap<string, CloneOwner>
	/** The links that may reach a clone; why they could not be read (every clone then stays). */
	links: readonly FolderLink[] | string
	/** The processes and their working folders; why they are not known (every clone then stays). */
	processes: readonly ProcessFolder[] | string
	/** The workspace the run is in: its `.worktrees/` holds the trash of its own scratch root. */
	workspace: string
	/** Reads a pid's start time; default `processStartTime`. */
	readStartTime?: (pid: number) => string | undefined
}
