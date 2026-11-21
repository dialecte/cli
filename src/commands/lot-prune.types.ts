import type { ItemDecision, LotPrunePlan } from '../lib/cleanup/plan-lot-prune.types.ts'
import type { HostAdapter } from '../lib/host/host.types.ts'
import type { BackgroundSpawner, ProcessFolder } from '../lib/worktree/worktree.types.ts'

/** What `dialecte lot prune` is called with: the command line, and the seams the tests stand in for. */
export type LotPruneParams = {
	cwd: string
	argv: string[]
	now?: Date
	/** Where lots land through pull requests; default: the repository's host, asked for each lot not landed yet. */
	host?: HostAdapter
	/** Lists the processes and their working folders; a throw is "not known". Default: the system's. */
	listProcesses?: () => ProcessFolder[] | string
	/** Starts the background removals; default: a detached process. */
	spawner?: BackgroundSpawner
	/** Where rehearsal clones are made: their links are read with the workspace's. Default: this machine's. */
	scratchRoots?: readonly string[]
	/** Told the plan once it is made, before anything moves (a test seam: a change made here meets the acts). */
	onPlanned?: (plan: LotPrunePlan) => void
	/** Told a throwaway's place in the trash once it moved, before its second proof (a test seam). */
	afterThrowawayMove?: (trashed: string) => void
}

/** What became of one item once the acts ran: removed (where to), kept (why), or waiting (on what). */
export type ItemOutcome = { removed: string } | { kept: string } | { waiting: string }

/**
 * One item of `lot prune --json` (and `lot close --feature --json`): what it is, its name (a path or a branch), its
 * decision, and, after `--yes`, its outcome. A rehearsal clone is `lot close --feature`'s only.
 */
export type LotPruneItemOutput = {
	item: 'worktree' | 'throwaway' | 'branch' | 'clone'
	name: string
	decision: ItemDecision
	outcome?: ItemOutcome
}

/** One lot of `lot prune --json`. */
export type LotPruneLotOutput = {
	lot: string
	state: string
	landing: string
	simulated: boolean
	stale?: string
	items: LotPruneItemOutput[]
}

/**
 * A worktree still registered under the trash: what git status shows and the person's command. One git refused to
 * delete gets the forced removal; one a removal left there (`left`: why its proof stopped it) gets the move back.
 */
export type RefusedTrashOutput = {
	worktree: string
	status: string
	command: string
	left?: string
}

/** `lot prune --json`. */
export type LotPruneOutput = { lots: LotPruneLotOutput[]; refused: RefusedTrashOutput[] }
