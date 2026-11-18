import type { ListedWorktree, NodeModulesCheck } from '../worktree/worktree.types.ts'

/** The lot's own declaration to archive into its lot folder before the worktree moves: where, and its bytes. */
export type DeclarationArchive = { path: string; bytes: string }

/** What `whyKeep` lets go: the worktree, the commits only its branch's reflog holds once it goes, the archive to write. */
export type Kept = {
	worktree: ListedWorktree
	/** The branch the worktree is on: the target's, compared before it is let go. */
	branch: string
	dropped: string | undefined
	archive: DeclarationArchive | undefined
}

/**
 * One target's decision before anything moves: kept with why, closed already (nothing to move), or let go with the
 * check of its `node_modules` made where it is.
 */
export type Decision =
	| { kept: string }
	| { alreadyClosed: true }
	| (Kept & { check: NodeModulesCheck | undefined; checkedLockText: string | undefined })
