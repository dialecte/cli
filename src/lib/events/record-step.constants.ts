import { UNRECORDED_STEPS } from '../gate-records/gate-records.constants.ts'
import { TDD_STEP } from '../tdd/tdd.constants.ts'

import type { GateMode } from '../gate/gate.types.ts'
import type { NodeModulesSource } from '../worktree/worktree.types.ts'
import type { RecordedStepKind, WorktreeAddParts } from './record-step.types.ts'

/** The start of the one line a step prints when its events could not be written (D11). */
export const NOT_RECORDED_PREFIX = 'events: not recorded: '

/** The start of the one line a step prints when its heavy marker could not be written or removed (its own slot). */
export const MARKERS_NOT_WRITTEN_PREFIX = 'markers: not written: '

/** The line of a step run in a worktree whose link names another lot's: `{step}`, `{worktree}`, `{lot}`. */
export const FOREIGN_STEP_LINE =
	'events: {step} ran in {worktree}, which links the lot {lot} but is not its worktree: recorded there as step.foreign only'

/** The parts every run lists as run, never counted for `reuse: whole` (the hygiene and the tdd step). */
export const ALWAYS_RUN_PARTS: readonly string[] = [...UNRECORDED_STEPS, TDD_STEP.name]

/** The step family of each gate mode. */
export const GATE_STEP_KINDS: Readonly<Record<GateMode, RecordedStepKind>> = {
	fast: 'gate-fast',
	full: 'gate-full',
	release: 'gate-release',
}

/** The kinds that are heavy as a whole: their marker spans the run. */
export const HEAVY_STEP_KINDS: readonly RecordedStepKind[] = [
	'gate-full',
	'gate-release',
	'contrib',
]

/** How a new worktree got its `node_modules`, as a `worktree-add` event says it: a copy or a clone reads `cloned`. */
export const NODE_MODULES_WORDS: Readonly<
	Record<NodeModulesSource['method'], WorktreeAddParts['nodeModules']>
> = {
	pooled: 'pooled',
	copy: 'cloned',
	'copy-on-write': 'cloned',
}

/** The status of a part a cut never hides behind a passing one. */
export const FAILED_PART_STATUS = 'failed'
