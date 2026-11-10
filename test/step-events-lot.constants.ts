/** The lot the step-event tests record into. */
export const STEP_LOT = '0171-repo-subscribe'

/** The keys every part of a gate run's `parts` carries (spec 4, step events). */
export const PART_KEYS: readonly string[] = [
	'counts',
	'durationMs',
	'failing',
	'heavy',
	'name',
	'rerun',
	'reused',
	'selection',
	'status',
]

/** A test step's output the gate counts: one vitest summary line. */
export const TEST_SUMMARY_COMMAND = "printf ' Tests  1 passed (1)\\n'"
