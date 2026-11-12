import type { PairRunsResult } from './event.types.ts'
import type { LedgerFinding } from './lot-report.types.ts'
import type { RecordedStepKind } from './record-step.types.ts'

/** The step families a report counts (every `RecordedStepKind` but the two folder steps, `worktree-add` and `throwaway-add`). */
export type SuiteFamily = Exclude<RecordedStepKind, 'worktree-add' | 'throwaway-add'>

/**
 * One tdd ledger entry: when it was written, and which tdd step wrote it (`null` when the ledger does not say: a run
 * of either family then holds it).
 */
export type TddEntryTime = { at: string; step: 'tdd-red' | 'tdd-green' | null }

/**
 * The record times of one worktree (the lot's or a throwaway's), read live or frozen on a `card` / `removing` line:
 * `null` for a record that does not exist. `worktree` is a real path, as the step events name it.
 */
export type WorktreeRecordTimes = {
	worktree: string
	gateFast: string | null
	gateFull: string | null
	gateRelease: string | null
	contrib: string | null
	gateHook: string | null
	/** `null` when the ledger exists but cannot be read: the tdd families are then unknown. */
	tdd: TddEntryTime[] | null
	/** The families whose gate record exists but cannot be read (its time `null`): unknown, never "no record". */
	unreadableGates?: SuiteFamily[]
}

/** A gate record of a worktree: its field, the family it makes unknown, and the family whose runs hold it. */
export type GateRecordFamily = {
	field: 'gateFast' | 'gateFull' | 'gateRelease' | 'contrib' | 'gateHook'
	family: SuiteFamily
	heldBy: SuiteFamily
}

/** A mutation run file of the repository: the worktree it ran for (real path) and when it started. */
export type MutationRunTime = { worktree: string; startedAt: string }

/** What the report knows of one step family. `runs` is `null` when the count is unknown: `atLeast` is then the counted runs. */
export type SuiteRow = {
	runs: number | null
	atLeast: number
	known: boolean
	/** Why the count is unknown; `null` when known. */
	unknownReason: string | null
	/** Runs that were interrupted, or started and never ended on a terminal lot (they are in `runs`). */
	interrupted: number
	/** Runs whose `reuse` is `whole`, and `partly`. */
	reused: number
	partlyReused: number
	/** Runs holding at least one part marked `rerun`. */
	reruns: number
	/** The most runs the lot's process allows in its worktree; `null` when none is set or its inputs are unknown. */
	limit: number | null
	/** True when `runs` passes `limit` (printed `!`). */
	over: boolean
	/** Per part name: runs that ran it and runs that reused it. */
	parts: Record<string, { ran: number; reused: number }>
	/** Failing parts a cut event did not list: `partsFailedTotal` minus the failing parts shown, summed over runs. */
	failingPartsNotShown: number
	/** Runs per station name, `shared` or `outside`. */
	byStation: Record<string, number>
}

/** The count of one family in the lot's review throwaways: the limit is the number of fixed findings of the ledger. */
export type ThrowawayRow = Pick<
	SuiteRow,
	'runs' | 'atLeast' | 'known' | 'unknownReason' | 'limit' | 'over'
>

/** The suites of a lot: the cli's families in the lot's worktree, and the throwaways' counts apart. */
export type SuiteReport = {
	families: Record<SuiteFamily, SuiteRow>
	/** Per family, the runs in throwaways (`throwaway: true`); only families that ran there, or left a record there. */
	throwaways: Partial<Record<SuiteFamily, ThrowawayRow>>
}

/** What counting the suites needs. */
export type CountSuitesParams = {
	now: string
	/** The lot's worktree (real path); `null` when the identity holds none. */
	worktree: string | null
	/** The brief's steps (S) and the rounds (R) of the lot; `null` when unknown. */
	steps: number | null
	rounds: number | null
	/** The lot is committed, canceled or failed: a start with no end is then an interrupted run. */
	terminal: boolean
	/** The events paired as `pairRuns` gives them. */
	paired: PairRunsResult
	/** The findings ledger: its `fixed` rows bound the throwaway runs. */
	ledger: readonly LedgerFinding[]
	/** The record times of every worktree the reader could read, live or frozen, each tagged with its worktree. */
	records: readonly WorktreeRecordTimes[]
	/** Worktrees (the lot's or a throwaway's) whose records are gone: no live folder and no frozen line. */
	goneWorktrees: readonly string[]
	mutationRuns: readonly MutationRunTime[]
}
