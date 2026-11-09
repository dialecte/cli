/** The function that makes a hard link, as `fs.linkSync` has it (the tests stand in for it). */
export type LinkFunction = (existingPath: string, newPath: string) => void

/** The function that makes the worktree, as `addWorktree` has it (the tests stand in for it). */
export type AddWorktreeFunction = (params: {
	repository: string
	branch: string
	from?: string
	index?: string
	now: Date
}) => { worktree: string } | string

/** The function that makes the `.dialecte/lot` link, as `fs.symlinkSync` has it (target, then path; the tests stand in for it). */
export type SymlinkFunction = (target: string, path: string) => void

/** What the tests inject into `startLot`: each step of the start that a test needs to fail or to interleave. */
export type StartSeams = {
	/** The hard-link function of the probe (D6). */
	link?: LinkFunction
	/** The worktree maker; it returns the refusal text, or throws. */
	addWorktree?: AddWorktreeFunction
	/** The function that makes the `.dialecte/lot` link, once the worktree exists. */
	symlink?: SymlinkFunction
	/** Called between the pick of the index and the creation of its claim (`claimWorktreeIndex`'s `afterPick`). */
	afterClaimPick?: () => void
	/** Called just before the lot folder is published (`publishLotFolder`), once the store list holds the store. */
	beforePublish?: () => void
}

/**
 * The worktree and its link made; the worktree made and why its link was not (the lot goes on, `status` reports the
 * link missing); or why the worktree was not made (the lot then holds a `failed` transition).
 */
export type LotWorktreeResult =
	| { worktree: string; link: string }
	| { worktree: string; linkRefused: string }
	| { failed: string }
