/** The kind of package the worktree holds: a dialecte package, or an app that installs a dialecte. */
export type LotWorktreeKind = 'dialecte' | 'app'

/**
 * What the worktree's lot link holds: a base ref and commit, only a commit, a commit git cannot read, or no link at all.
 */
export type LotWorktreeSource = 'lot-link' | 'lot-link-commit-only' | 'unreadable-link' | 'none'

/** How a lot cut before main added the package brings main in: by a rebase or by a merge of main. */
export type LotWorktreeMove = 'rebase' | 'merge'

/** The parent of a stacked lot: an open lot of the store, or a name the store holds no lot of. */
export type StackParentState = 'open' | 'unreadable'

/** A worktree cut from `main`, then each branch moved on; its test file adds a splice on top of an old one. */
export type LotWorktree = {
	root: string
	/** The short merge-base of the worktree's HEAD and main: neither of their tips. */
	shortSha: string
	/** The full merge-base commit. */
	baseCommit: string
	/** The release tag put on the base commit, when asked. */
	releaseTag?: string
}
