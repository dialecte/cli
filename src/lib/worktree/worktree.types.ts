/** How `node_modules` was copied, and the package links re-pointed so they still reach their target. */
export type NodeModulesCopy = {
	method: 'copy-on-write' | 'copy'
	relinked: string[]
}

/** What a worktree looked like when it was made: `gate --fast` compares with it. */
export type HygieneBaseline = {
	/**
	 * The commits of the stash entries when the worktree was made: any other entry is new, whichever
	 * entries another session drops meanwhile.
	 */
	stashCommits: string[]
	head: string
	/** ISO date. */
	writtenAt: string
}

/** The hygiene of a worktree against its baseline: failures fail the gate, warnings and notes do not. */
export type HygieneReport = {
	failures: string[]
	/** Read-only commands to look at what a failure found. */
	look: string[]
	warnings: string[]
	notes: string[]
}

/** What `worktree add` made. */
export type AddedWorktree = {
	repository: string
	worktree: string
	branch: string
	/** Where the branch started: the given ref, the base branch, or the existing branch. */
	from: string
	head: string
	/** The hooks folder copied from the main checkout, if any. */
	hooks: string | undefined
	nodeModules: NodeModulesCopy | undefined
	baseline: HygieneBaseline
}

/** One thing `worktree prune` removes, or keeps with why. */
export type PruneItem = {
	kind: 'worktree' | 'branch' | 'hand-over' | 'rehearsal clone'
	/** The worktree or hand-over path, the branch name. */
	name: string
	/** Absent: removed by `command`. */
	kept?: string
	/** The removal, with its absolute `cd`. */
	command?: string
}

/** `worktree prune` for one repository. */
export type PrunePlan = {
	repository: string
	baseBranch: string
	items: PruneItem[]
	/** Why the repository was skipped as a whole. */
	skipped?: string
}

/** One entry of `git stash list`. */
export type StashEntry = {
	/** Its place in the stash: `stash@{index}`. */
	index: number
	commit: string
	/** `WIP on <branch>: <sha> <subject>` or `On <branch>: <message>`. */
	subject: string
	/** The branch the entry was pushed on, read from its subject. */
	branch?: string
}

/** `worktree prune` for a workspace: each repository, and the rehearsal clones left behind. */
export type WorkspacePrunePlan = { repositories: PrunePlan[]; scratch: PruneItem[] }

/** How a `cp` ended: its exit status, or the signal that stopped it. */
export type CopyRun = { status: number | null; signal: NodeJS.Signals | null }
