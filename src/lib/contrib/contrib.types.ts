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

/** The `gate --full` records current for the worktree, and the steps today's `gate --full` runs. */
export type FullGateRecords = {
	fullSteps: GateStep[]
	records: GateRecord[]
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
