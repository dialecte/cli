import type { GateRecord } from '../gate-records/gate-records.types.ts'
import type { GateStep } from '../gate/gate-config.types.ts'
import type { StepStatus } from '../gate/gate.types.ts'

/** A row `dialecte contrib` runs in process rather than through a shell command. */
export type BuiltinStep = {
	name: string
	builtin: 'rules' | 'release'
}

/** A row of `dialecte contrib`: a package step, or a built-in one. */
export type ContribStep = GateStep | BuiltinStep

/**
 * The gate records current for the worktree that answer contrib's steps: those of `gate --full`, then those of a
 * `gate --release` whose list covers full; each with the steps its list runs today.
 */
export type FullGateRecords = {
	sources: AnsweringGateRecords[]
}

/** One gate list's current green records, the steps it runs today, and whether a scoped step of it answers. */
export type AnsweringGateRecords = {
	steps: GateStep[]
	records: GateRecord[]
	/** False for `full`: a scoped pass checked only what changed since its base; true for a release (everything). */
	scopedAnswers: boolean
}

/** One row of `dialecte contrib`, as `--json` prints it. */
export type ContribRow = {
	name: string
	status: StepStatus | 'warning'
	detail: string
}

/** A row and the lines printed under it (the findings of the rules row, what the mutation row owes). */
export type ContribLine = {
	row: ContribRow
	under: string[]
}
