/** One store lot as the holds reader read it: its folder, worktree and branch (from its identity or entry), state, keep. */
export type LotRecord = {
	name: string
	lotFolder: string
	worktree?: string
	branch?: string
	/** Its state, `damaged` when its records do not read. */
	state: string
	/** Its keep text when kept on purpose (or damaged). */
	kept?: string
	main: string
}

/** The item a worktree or branch is of a lot: held (open, damaged, kept on purpose) or a closed lot's own. */
export type LotItem = {
	lot: string
	lotFolder: string
	branch?: string
	held: boolean
	reason: string
}

/** Every store lot of a repository: its records, and its items by worktree, branch and lot folder (real paths). */
export type LotItems = {
	store: string | undefined
	lots: readonly LotRecord[]
	byWorktree: ReadonlyMap<string, LotItem>
	byBranch: ReadonlyMap<string, LotItem>
	byLotFolder: ReadonlyMap<string, LotItem>
}
