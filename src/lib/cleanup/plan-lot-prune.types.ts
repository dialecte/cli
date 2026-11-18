/** What `lot prune` decides, before anything moves: per repository, per lot, per item. */
export type LotPrunePlan = { repositories: RepositoryPlan[] }

/** One repository's lots, each with its items. */
export type RepositoryPlan = { main: string; lots: LotPlan[] }

/**
 * One lot: its state, the line its landing reads, whether it is simulated (listed, never decided), and its items. A
 * lot whose worktree is gone and whose landing is not proven is stale: listed with why and the person's command.
 */
export type LotPlan = {
	lot: string
	state: string
	landing: string
	simulated: boolean
	stale: string | undefined
	items: PlannedItem[]
}

/** One item: what it is, where (a path, or a branch name), and its decision. */
export type PlannedItem = {
	item: 'worktree' | 'throwaway' | 'branch'
	/** A worktree's path, or a branch's name. */
	name: string
	decision: ItemDecision
}

/** An item goes, waits on another item of the run (a branch on its worktree), or is kept with why. */
export type ItemDecision = { go: true } | { after: string } | { kept: string }
