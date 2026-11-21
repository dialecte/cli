import type { runLotClose } from '../src/commands/lot-close.ts'
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

/** What `lot close --feature` is called with in the cases: `runLotClose`'s parameters and its start time reader. */
export type CloseFeatureParams = Parameters<typeof runLotClose>[0] & {
	/** Reads a pid's start time (a rehearsal marker's owner); default the system's. */
	readStartTime?: (pid: number) => string | undefined
}

/** One item of `lot close --feature --json`: a lot's worktree, throwaway or rehearsal clone, decided, then acted on. */
export type ClosedFeatureItem = {
	item: string
	name: string
	decision: Record<string, unknown>
	outcome?: Record<string, unknown>
}

/**
 * `lot close --feature --json`: the feature's open lots that refuse the close, each lot with its items, and the
 * rehearsal clones of no lot of the feature, each kept with why.
 */
export type ClosedFeatureOutput = {
	open: { lot: string; state: string }[]
	lots: { lot: string; state: string; items: ClosedFeatureItem[] }[]
	clones: { clone: string; kept: string }[]
}

/** A `lot close --feature` run read back: its exit code, its JSON when it printed some, and its text. */
export type ClosedFeatureRun = {
	exitCode: number
	output: ClosedFeatureOutput | undefined
	text: string
}

/** What became of one rehearsal clone: moved (where to), kept (why), or not named by the run. */
export type CloneFate = { removed: string } | { kept: string } | { unnamed: true }
