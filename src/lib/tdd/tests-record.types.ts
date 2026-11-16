import type { GateRecordMode } from '../gate-records/gate-records.types.ts'
import type { StepCounts } from '../gate/gate.types.ts'
import type { CaseStatus, ReceiptFlag } from './tdd.types.ts'

/** A case of the change as a public row: where it is, its tdd status and flags; never a reason or a message. */
export type TestsRecordCase = {
	file: string
	name: string
	/** The vitest project or runner group; absent for the default one. */
	project?: string
	status: CaseStatus
	/** Absent when the case carries none. */
	flags?: ReceiptFlag[]
}

/** The tdd part: the cases of the change at the last `tdd green`, and how many hold each status. */
export type TestsRecordTdd = {
	/** ISO time of the `tdd green` that wrote it. */
	at: string
	cases: TestsRecordCase[]
	counts: Partial<Record<CaseStatus, number>>
}

/** The gate part: the newest gate run of the worktree that counted tests, and the tree it ran on. */
export type TestsRecordGate = {
	mode: GateRecordMode
	at: string
	head: string
	stateHash: string
	tests?: StepCounts['tests']
	testFiles?: StepCounts['testFiles']
}

/** A lot's `tests.json`: each part absent until its writer ran. */
export type TestsRecord = { schema: 1; tdd?: TestsRecordTdd; gate?: TestsRecordGate }
