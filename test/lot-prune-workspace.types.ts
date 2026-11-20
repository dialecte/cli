import type { ItemOutcome, LotPruneOutput } from '../src/commands/lot-prune.types.ts'
import type { ItemDecision } from '../src/lib/cleanup/plan-lot-prune.types.ts'

/** A repository with a lot worktree, its round-1 snapshot and the review throwaway made from it. */
export type ThrowawayWorkspace = {
	/** The main checkout, on `main`. */
	repository: string
	/** The lot's worktree, on `lotBranch`. */
	lotWorktree: string
	lotBranch: string
	/** The lot folder holding `round-1/`, `round-1.deleted` and `round-1.base`. */
	lotFolder: string
	/** The throwaway worktree, on `branch`, holding round 1. */
	throwaway: string
	branch: string
	round: number
}

/** A recorded review throwaway of a store lot: its real path, its branch and that branch's tip. */
export type RecordedRound = { path: string; branch: string; tip: string }

/** A `lot prune --json` run read back: its exit code, its output, and its text when it printed no JSON. */
export type PruneRun = { exitCode: number; output: LotPruneOutput; text?: string }

/** A lot's items in a `lot prune --json` run, keyed `<item> <name>`: the decision, and the outcome after `--yes`. */
export type PrunedItems = Record<string, { decision: ItemDecision; outcome?: ItemOutcome }>
