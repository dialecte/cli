import { HEAVY_STEP_KINDS } from './record-step.constants.ts'

import type { RecordedStepKind } from './record-step.types.ts'

/** The step kinds heavy as a whole (spec 4, D26): the report lists the run's duration, never its parts. */
export const HEAVY_RUN_KINDS: readonly RecordedStepKind[] = [
	...HEAVY_STEP_KINDS,
	'mutation',
	'rehearsal',
]

/** The step kind of a new lot worktree, a folder-heavy step. */
export const WORKTREE_ADD_STEP: RecordedStepKind = 'worktree-add'

/** The step kind of a new review throwaway, a folder-heavy step. */
export const THROWAWAY_ADD_STEP: RecordedStepKind = 'throwaway-add'

/** Between a heavy step and its part name in the heavy list (`gate-fast: e2e`). */
export const HEAVY_PART_SEPARATOR = ': '
