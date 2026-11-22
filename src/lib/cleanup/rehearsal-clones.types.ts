import type { FolderLink, ProcessFolder } from '../worktree/worktree.types.ts'
import type { CloneOwner, OwnerReads } from './clone-decision.types.ts'

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

/** What every clone decision reads: the owner reads, the feature's lots, the links, the processes, the workspace. */
export type CloneReads = {
	/** The lots and registry entries a clone's owner is read from (`cloneOwnerOf`). */
	ownerReads: OwnerReads
	/** The feature's lot folders, by real path: a clone of any other lot is decided by `worktree prune`. */
	featureLots: ReadonlySet<string>
	/** The links that may reach a clone; why they could not be read (every clone then stays). */
	links: readonly FolderLink[] | string
	/** The processes and their working folders; why they are not known (every clone then stays). */
	processes: readonly ProcessFolder[] | string
	/** The workspace the run is in: its `.worktrees/` holds the trash of its own scratch root. */
	workspace: string
	/** Reads a pid's start time; default `processStartTime`. */
	readStartTime?: (pid: number) => string | undefined
}
