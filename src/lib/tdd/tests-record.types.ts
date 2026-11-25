import type { GateRecordMode } from '../gate-records/gate-records.types.ts'
import type { StepCounts } from '../gate/gate.types.ts'
import type { CaseStatus, CaseStatusLine, ReceiptFlag } from './tdd.types.ts'

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
	/** The commit and the state hash of the tree the cases were read on. */
	head: string
	stateHash: string
	cases: TestsRecordCase[]
	counts: Partial<Record<CaseStatus, number>>
}

/**
 * The gate part: the newest folded gate run that ran tests and the tree it ran on, and the failures still open
 * (`foldGateRecords`). `mode` is null only on a part seeded over a `tests.json` that did not read (its one entry
 * unknown); `failures` is absent only on a part an older cli wrote.
 */
export type TestsRecordGate = {
	mode: GateRecordMode | null
	/** When the newest folded run ran (a reused run: the run that really ran its steps). */
	at: string
	head: string
	stateHash: string
	tests?: StepCounts['tests']
	testFiles?: StepCounts['testFiles']
	failures?: TestFailure[]
}

/** Where and when a failure was seen: the gate run that failed it. */
type FailureRun = { mode: GateRecordMode; head: string; stateHash: string; at: string }

/** A test key a test step failed, with its cases (each `<key> > <path>`). */
export type NamedTestFailure = FailureRun & { key: string; cases: string[] }

/** A test step that failed naming no key, with the keys its failing run ran and the failed count it printed. */
export type NamelessTestFailure = FailureRun & {
	key: null
	ranFiles: string[]
	failed: number | null
}

/** A failure the cli cannot name: an older cli's part failing on its counts, or a `tests.json` that did not read. */
export type UnknownTestFailure = { key: null; unknown: string; at: string }

/** An open failure of the gate part's ledger. */
export type TestFailure = NamedTestFailure | NamelessTestFailure | UnknownTestFailure

/** A lot's `tests.json`: each part absent until its writer ran. */
export type TestsRecord = { schema: 1; tdd?: TestsRecordTdd; gate?: TestsRecordGate }

/** What the tdd part is written from: the time and tree of the `tdd green`, and the cases of the change. */
export type TddPartSource = {
	at: string
	head: string
	stateHash: string
	cases: readonly CaseStatusLine[]
}

/** What the one reader of `tests.json` answers: no file, the record, or why it does not read. */
export type TestsFileRead = { absent: true } | { record: TestsRecord } | { unreadable: string }
