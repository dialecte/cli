import type { RecordedStepKind } from './record-step.types.ts'

/** The owner of a step whose start several open station runs hold (parallel stations). */
export const SHARED_OWNER = 'shared'

/** The owner of a step no station run holds, or a step the orchestration runs. */
export const OUTSIDE_OWNER = 'outside'

/** The owner labels the report gives: no station may carry one of these names. */
export const REPORT_OWNER_LABELS: readonly string[] = [SHARED_OWNER, OUTSIDE_OWNER]

/**
 * The steps the orchestration runs: always `outside`, whatever station is open meanwhile (spec 7); `gate-release`
 * (a release gate, run by the orchestration like `gate-full`) among them.
 */
export const ORCHESTRATION_STEPS: readonly RecordedStepKind[] = [
	'gate-full',
	'gate-release',
	'gate-hook',
	'rehearsal',
	'handover-run',
	'worktree-add',
	'throwaway-add',
]

/** Milliseconds in a second. */
export const MS_PER_SECOND = 1_000
