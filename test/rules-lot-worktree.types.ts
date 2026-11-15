/** The kind of package the worktree holds: a dialecte package, or an app that installs a dialecte. */
export type LotWorktreeKind = 'dialecte' | 'app'

/**
 * How the worktree says which base it was cut for: a lot link (its identity's base ref, or only its commit), a hygiene
 * baseline (its `from` readable, or not), a link and a baseline together, a link to an unreadable ref, nothing.
 */
export type LotWorktreeSource =
	| 'lot-link'
	| 'lot-link-commit-only'
	| 'hygiene-baseline'
	| 'hygiene-baseline-unreadable-from'
	| 'link-and-baseline'
	| 'unreadable-ref-link'
	| 'none'

/** A worktree cut from `main`, then each branch moved on; its test file adds a splice on top of an old one. */
export type LotWorktree = {
	root: string
	/** The short merge-base of the worktree's HEAD and main: neither of their tips. */
	shortSha: string
	/** The full merge-base commit. */
	baseCommit: string
}
