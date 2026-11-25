/**
 * The gate part's ledger of open failures (D2): every gate run that ran tests, folded oldest first after the part's
 * own time, opens the keys a failed test step names and clears a key only when a step ran it and nothing in that run
 * failed it; a whole-suite pass clears every entry. A run that tested nothing, an older run and a hook's run change
 * nothing.
 */
import { fileOfTestKey } from '../gate/vitest-output.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { OLDER_CLI_FAILURE, WHOLE_SUITE_BASE_SOURCE } from './tests-record.constants.ts'

import type { GateRecord, RecordedStep } from '../gate-records/gate-records.types.ts'
import type {
	NamedTestFailure,
	NamelessTestFailure,
	TestFailure,
	TestsRecordGate,
} from './tests-record.types.ts'

/** The gate part after folding `records` into `previous`; undefined when there is neither a part nor a run that ran tests. */
export function foldGateRecords(params: {
	previous: TestsRecordGate | undefined
	records: readonly GateRecord[]
}): TestsRecordGate | undefined {
	const previous = params.previous && withLedger(params.previous)
	const after = previous?.at ?? ''
	const folded = params.records
		.filter((record) => record.mode !== 'hook' && testStepsOf(record).length > 0)
		.filter((record) => ranAtOf(record) > after)
		.sort((one, other) => ranAtOf(one).localeCompare(ranAtOf(other)))
	return folded.reduce<TestsRecordGate | undefined>(
		(part, record) => foldRecord({ part, record }),
		previous,
	)
}

/** A gate part holding only an unknown failure: a `tests.json` that did not read, seeded so no writer drops a failure. */
export function seededGatePart(params: {
	why: string
	at: string
	head: string
	stateHash: string
}): TestsRecordGate {
	return {
		mode: null,
		at: params.at,
		head: params.head,
		stateHash: params.stateHash,
		failures: [{ key: null, unknown: params.why, at: params.at }],
	}
}

/**
 * A record whose every step passed or was skipped (none failed, none left unrun), holding a test step, each test
 * step choosing the whole suite: `all`, or scoped against the empty tree (a release run).
 */
export function isWholeSuitePass(record: GateRecord): boolean {
	if (record.steps.some((step) => step.status === 'failed' || step.status === 'not-run'))
		return false
	const tested = record.steps.filter((step) => step.testStep === true)
	if (tested.length === 0) return false
	return tested.every(
		(step) =>
			step.selects === 'all' ||
			(step.selects === 'scoped' && record.base?.source === WHOLE_SUITE_BASE_SOURCE),
	)
}

/** The part with its ledger: an older cli's part (no `failures`) failing on its counts gets an unknown entry. */
function withLedger(part: TestsRecordGate): TestsRecordGate {
	if (part.failures !== undefined) return part
	const failed = part.tests?.failed ?? 0
	const failedFiles = part.testFiles?.failed ?? 0
	if (failed === 0 && failedFiles === 0) return { ...part, failures: [] }
	return {
		...part,
		failures: [
			{
				key: null,
				unknown: fillMessage({
					template: OLDER_CLI_FAILURE,
					values: { failed: String(failed || failedFiles) },
				}),
				at: part.at,
			},
		],
	}
}

/** When a record's steps really ran: a reused record's, the run it reused. */
function ranAtOf(record: GateRecord): string {
	return record.reused?.at ?? record.at
}

/** A record's test steps that ran: marked so by a new cli, or, in an older cli's record, those that counted tests. */
function testStepsOf(record: GateRecord): RecordedStep[] {
	const marked = record.steps.filter((step) => step.testStep === true)
	if (marked.length > 0) return marked
	return record.steps.filter(
		(step) =>
			step.counts.tests !== undefined && (step.status === 'passed' || step.status === 'failed'),
	)
}

/** One record folded: the carried entries it clears go, then the entries it opens are added; the summary is its run. */
function foldRecord(params: {
	part: TestsRecordGate | undefined
	record: GateRecord
}): TestsRecordGate {
	const { record } = params
	const steps = testStepsOf(record)
	const carried = params.part?.failures ?? []
	const kept = isWholeSuitePass(record)
		? []
		: carried.filter((failure) => !clears({ failure, steps }))
	const opened = steps.flatMap((step) => openedBy({ step, record }))
	const counted = steps.find((step) => step.counts.tests !== undefined)
	return {
		mode: record.mode,
		at: ranAtOf(record),
		head: record.head,
		stateHash: record.stateHash,
		...(counted?.counts.tests && { tests: counted.counts.tests }),
		...(counted?.counts.testFiles && { testFiles: counted.counts.testFiles }),
		failures: mergedFailures({ kept, opened }),
	}
}

/** Whether the record's test steps clear a carried entry: a named one's key, or every key a nameless one's run ran. */
function clears(params: { failure: TestFailure; steps: readonly RecordedStep[] }): boolean {
	const { failure, steps } = params
	if (failure.key !== null) return passesKey({ key: failure.key, steps })
	if ('unknown' in failure) return false
	if (failure.ranFiles.length === 0) return false
	return failure.ranFiles.every((key) => passesKey({ key, steps }))
}

/**
 * A step that did not fail ran the key, and no step failed it: a failed step counts as failing every key it ran. A
 * key with no project matches the same file under any project.
 */
function passesKey(params: { key: string; steps: readonly RecordedStep[] }): boolean {
	const { key, steps } = params
	function ran(step: RecordedStep): boolean {
		return [...(step.ranFiles ?? []), ...(step.failingKeys ?? [])].some((ranKey) =>
			sameTest({ key, ranKey }),
		)
	}
	if (steps.some((step) => step.status === 'failed' && ran(step))) return false
	return steps.some(
		(step) =>
			step.status === 'passed' && (step.ranFiles ?? []).some((ranKey) => sameTest({ key, ranKey })),
	)
}

/** A key matches a ran key when they are equal, or when it has no project and names the ran key's file. */
function sameTest(params: { key: string; ranKey: string }): boolean {
	const { key, ranKey } = params
	return key === ranKey || (fileOfTestKey(key) === key && fileOfTestKey(ranKey) === key)
}

/** The entries a failed test step opens: one per key it names (an older cli's: its failing files), else one nameless. */
function openedBy(params: { step: RecordedStep; record: GateRecord }): TestFailure[] {
	const { step, record } = params
	if (step.status !== 'failed') return []
	const run = {
		mode: record.mode,
		head: record.head,
		stateHash: record.stateHash,
		at: ranAtOf(record),
	}
	const keys = step.failingKeys ?? (step.ranFiles === undefined ? (step.failing ?? []) : [])
	if (keys.length === 0) {
		const nameless: NamelessTestFailure = {
			key: null,
			...run,
			ranFiles: step.ranFiles ?? [],
			failed: step.counts.tests?.failed ?? null,
		}
		return [nameless]
	}
	return keys.map(function namedOf(key): NamedTestFailure {
		const cases = (step.failingCases ?? []).filter((testCase) => testCase.startsWith(`${key} > `))
		return { key, cases, ...run }
	})
}

/** The kept entries, then the opened ones; an opened named entry replaces a kept one of its key. */
function mergedFailures(params: {
	kept: readonly TestFailure[]
	opened: readonly TestFailure[]
}): TestFailure[] {
	const openedKeys = new Set(
		params.opened.flatMap((failure) => (failure.key === null ? [] : [failure.key])),
	)
	return [
		...params.kept.filter((failure) => failure.key === null || !openedKeys.has(failure.key)),
		...params.opened,
	]
}
