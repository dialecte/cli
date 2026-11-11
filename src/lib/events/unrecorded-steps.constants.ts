import type { GateRecordFamily, SuiteFamily } from './unrecorded-steps.types.ts'

/** The step families a report counts, in the order it prints them. */
export const SUITE_FAMILIES: readonly SuiteFamily[] = [
	'gate-fast',
	'gate-full',
	'gate-release',
	'gate-hook',
	'contrib',
	'tdd-red',
	'tdd-green',
	'mutation',
	'rehearsal',
	'handover-run',
]

/** The tdd families: a ledger entry whose step is `null` is held by a run of either. */
export const TDD_FAMILIES: readonly SuiteFamily[] = ['tdd-red', 'tdd-green']

/**
 * The gate records of a worktree and the runs that hold them: a hook record is written by `handover run` after its
 * commit, so a `handover-run` run holds it, never a `gate-hook` end; it makes `gate-hook` unknown.
 */
export const GATE_RECORD_FAMILIES: readonly GateRecordFamily[] = [
	{ field: 'gateFast', family: 'gate-fast', heldBy: 'gate-fast' },
	{ field: 'gateFull', family: 'gate-full', heldBy: 'gate-full' },
	{ field: 'gateRelease', family: 'gate-release', heldBy: 'gate-release' },
	{ field: 'contrib', family: 'contrib', heldBy: 'contrib' },
	{ field: 'gateHook', family: 'gate-hook', heldBy: 'handover-run' },
]

/** How long after a run's end its own record may be stamped and still count as held (spec 7, `[start, end + 5 s]`). */
export const RECORD_GRACE_MS = 5_000

/** The family whose run files outlive the worktree (the repository's common folder holds them). */
export const MUTATION_FAMILY: SuiteFamily = 'mutation'

/** The gate family whose limit is S + max(R, 1) - 1 in the lot's worktree. */
export const FAST_GATE_FAMILY: SuiteFamily = 'gate-fast'

/** The gate family whose limit is 1 plus one per failed run. */
export const FULL_GATE_FAMILY: SuiteFamily = 'gate-full'

/** The ledger state of a fixed finding: each allows one run on the old code in a throwaway. */
export const FIXED_FINDING_STATE = 'fixed'

/** The `outcome` of a step killed after its start. */
export const INTERRUPTED_OUTCOME = 'interrupted'

/** The `reuse` of a gate answered whole from its record. */
export const WHOLE_REUSE = 'whole'

/** The `reuse` of a gate answered in part from its record, its other steps run. */
export const PARTLY_REUSE = 'partly'

/** Why a count is unknown, as the report names it. */
export const UNKNOWN_REASONS = {
	noEvent: 'no event recorded',
	noStepEvents: "the worktree's cli writes no step events",
	foreign: 'a run in a moved or copied worktree',
	gone: "the worktree's records are gone",
	noTrace: 'no step left a trace',
	unreadable: 'a record could not be read',
	unrecorded: 'a run no event records',
} as const
