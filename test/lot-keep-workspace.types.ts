/** The states a lot of the keep-rule fixtures is in: what its records say. */
export type LotKeepState =
	| 'working'
	| 'input-required'
	| 'ready'
	| 'failed'
	| 'canceled'
	| 'committed'

/** A lot and the real git worktree its identity names. */
export type LotWorktree = {
	/** The lot's full name; the worktree folder has the same name. */
	name: string
	/** The branch of the worktree: `feat/<tail of the name>`. */
	branch: string
	/** The real path of the worktree. */
	worktree: string
	/** The real path of the lot folder. */
	lotFolder: string
}
