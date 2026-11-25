/**
 * The gate part's ledger of open failures (D2): what opens an entry, what clears it, and what changes nothing.
 */
import { foldGateRecords, seededGatePart } from './gate-ledger.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord, RecordedStep } from '../gate-records/gate-records.types.ts'
import type { TestFailure, TestsRecordGate } from './tests-record.types.ts'

const HEAD_A = 'a'.repeat(40)
const HEAD_B = 'b'.repeat(40)
const TREE_A = '1'.repeat(64)
const TREE_B = '2'.repeat(64)
const KEY = '|node| src/a.test.ts'
const OTHER_KEY = '|node| src/b.test.ts'
const COUNTS = { tests: { passed: 4, failed: 0, skipped: 0, total: 4 } }
const FAILED_COUNTS = { tests: { passed: 3, failed: 1, skipped: 0, total: 4 } }

/** A test step of a new cli: passed, ran `ranFiles`, choosing its tests as `selects`. */
function passedStep(params: {
	ranFiles: string[]
	selects?: 'all' | 'changed' | 'scoped'
	name?: string
}): RecordedStep {
	return {
		name: params.name ?? 'tests',
		status: 'passed',
		counts: COUNTS,
		testStep: true,
		selects: params.selects ?? 'scoped',
		ranFiles: params.ranFiles,
	}
}

/** A test step of a new cli that failed `keys` (each with one case), having run `ranFiles`. */
function failedStep(params: {
	keys: string[]
	ranFiles: string[]
	selects?: 'all' | 'changed' | 'scoped'
	name?: string
}): RecordedStep {
	return {
		name: params.name ?? 'tests',
		status: 'failed',
		counts: FAILED_COUNTS,
		testStep: true,
		selects: params.selects ?? 'scoped',
		ranFiles: params.ranFiles,
		...(params.keys.length > 0 && {
			failingKeys: params.keys,
			failingCases: params.keys.map((key) => `${key} > group > one`),
		}),
	}
}

/** A gate record of `mode` at `at` on tree A holding `steps` after a passed check. */
function record(params: {
	mode?: 'fast' | 'full' | 'release' | 'hook'
	at: string
	steps: RecordedStep[]
	head?: string
	stateHash?: string
	base?: GateRecord['base']
	reused?: GateRecord['reused']
}): GateRecord {
	return {
		mode: params.mode ?? 'fast',
		at: params.at,
		head: params.head ?? HEAD_A,
		stateHash: params.stateHash ?? TREE_A,
		steps: [{ name: 'check', status: 'passed', counts: {} }, ...params.steps],
		...(params.base && { base: params.base }),
		...(params.reused && { reused: params.reused }),
	}
}

/** The keys of the part's open entries, nameless and unknown ones as `nameless` and `unknown`. */
function openOf(part: TestsRecordGate | undefined): string[] {
	return (part?.failures ?? []).map(function labelOf(failure: TestFailure) {
		if (failure.key !== null) return failure.key
		return 'unknown' in failure ? 'unknown' : 'nameless'
	})
}

/** The part a failing fast run of `KEY` at 10:00 leaves. */
function failingPart(): TestsRecordGate | undefined {
	return foldGateRecords({
		previous: undefined,
		records: [record({ at: 'T10', steps: [failedStep({ keys: [KEY], ranFiles: [KEY] })] })],
	})
}

describe('foldGateRecords - a named failure opens, with its run', () => {
	it('a failed test step naming a key -> one named entry: its key, cases, mode, head, tree and time; the summary is the run', () => {
		expect(failingPart()).toEqual({
			mode: 'fast',
			at: 'T10',
			head: HEAD_A,
			stateHash: TREE_A,
			tests: FAILED_COUNTS.tests,
			failures: [
				{
					key: KEY,
					cases: [`${KEY} > group > one`],
					mode: 'fast',
					head: HEAD_A,
					stateHash: TREE_A,
					at: 'T10',
				},
			],
		})
	})

	it('a flaky step (passed, its first run’s failing keys kept) -> nothing opened', () => {
		const flaky: RecordedStep = {
			...passedStep({ ranFiles: [KEY] }),
			note: 'flaky in parallel',
			failing: ['src/a.test.ts'],
			failingKeys: [KEY],
		}

		expect(
			openOf(
				foldGateRecords({ previous: undefined, records: [record({ at: 'T10', steps: [flaky] })] }),
			),
		).toEqual([])
	})
})

describe('foldGateRecords - what keeps a named failure open', () => {
	it.each([
		{
			what: 'a fast run stopped at check (its test step not run)',
			next: record({
				at: 'T11',
				steps: [{ name: 'tests', status: 'not-run', counts: {} }],
			}),
		},
		{
			what: 'an older passing full record',
			next: record({
				mode: 'full',
				at: 'T09',
				steps: [passedStep({ ranFiles: [KEY], selects: 'all' })],
			}),
		},
		{
			what: 'a --changed pass that ran nothing',
			next: record({ at: 'T11', steps: [passedStep({ ranFiles: [], selects: 'changed' })] }),
		},
		{
			what: 'a scoped pass that leaves the key out',
			next: record({ at: 'T11', steps: [passedStep({ ranFiles: [OTHER_KEY] })] }),
		},
		{
			what: 'a --project node pass of the file failing under browser',
			next: record({ at: 'T11', steps: [passedStep({ ranFiles: [KEY] })] }),
			previousKey: '|browser| src/a.test.ts',
		},
		{
			what: 'a hook record whose step passed the key',
			next: record({ mode: 'hook', at: 'T11', steps: [passedStep({ ranFiles: [KEY] })] }),
		},
		{
			what: 'a record where one step passes the key and another fails it',
			next: record({
				at: 'T11',
				steps: [
					passedStep({ ranFiles: [KEY], name: 'node' }),
					failedStep({ keys: [OTHER_KEY], ranFiles: [KEY, OTHER_KEY], name: 'more' }),
				],
			}),
		},
		{
			what: 'a reused full record whose run ran before the failure',
			next: record({
				mode: 'full',
				at: 'T11',
				steps: [passedStep({ ranFiles: [KEY], selects: 'all' })],
				reused: { at: 'T09', head: HEAD_A },
			}),
		},
	])('a failure of the key, then $what -> kept', ({ next, previousKey }) => {
		const failing = foldGateRecords({
			previous: undefined,
			records: [
				record({
					at: 'T10',
					steps: [failedStep({ keys: [previousKey ?? KEY], ranFiles: [previousKey ?? KEY] })],
				}),
			],
		})

		expect(openOf(foldGateRecords({ previous: failing, records: [next] }))).toContain(
			previousKey ?? KEY,
		)
	})
})

describe('foldGateRecords - what clears a named failure', () => {
	it.each([
		{ what: 'a scoped pass that ran the key', step: passedStep({ ranFiles: [KEY] }) },
		{ what: 'a whole-suite pass', step: passedStep({ ranFiles: [], selects: 'all' }) },
		{
			what: 'a flaky pass of the key (its serial rerun passed it)',
			step: { ...passedStep({ ranFiles: [KEY] }), note: 'flaky in parallel', failingKeys: [KEY] },
		},
	])('a failure of the key, then $what -> cleared', ({ step }) => {
		expect(
			openOf(
				foldGateRecords({
					previous: failingPart(),
					records: [record({ at: 'T11', steps: [step] })],
				}),
			),
		).toEqual([])
	})

	it('a key with no project (an older cli’s), then a |node| run of the same file passing -> cleared', () => {
		const previous: TestsRecordGate = {
			mode: 'fast',
			at: 'T10',
			head: HEAD_A,
			stateHash: TREE_A,
			failures: [
				{
					key: 'src/a.test.ts',
					cases: [],
					mode: 'fast',
					head: HEAD_A,
					stateHash: TREE_A,
					at: 'T10',
				},
			],
		}

		expect(
			openOf(
				foldGateRecords({
					previous,
					records: [record({ at: 'T11', steps: [passedStep({ ranFiles: [KEY] })] })],
				}),
			),
		).toEqual([])
	})

	it('a reused full record of a run after the failure -> cleared, the summary its run’s time', () => {
		const next = record({
			mode: 'full',
			at: 'T12',
			head: HEAD_B,
			stateHash: TREE_B,
			steps: [passedStep({ ranFiles: [KEY], selects: 'all' })],
			reused: { at: 'T11', head: HEAD_B },
		})

		expect(foldGateRecords({ previous: failingPart(), records: [next] })).toMatchObject({
			mode: 'full',
			at: 'T11',
			head: HEAD_B,
			stateHash: TREE_B,
			failures: [],
		})
	})
})

describe('foldGateRecords - two test steps in one record', () => {
	it('node passes, browser fails -> the browser key open', () => {
		const both = record({
			mode: 'full',
			at: 'T10',
			steps: [
				passedStep({ ranFiles: [KEY], selects: 'all', name: 'node' }),
				failedStep({
					keys: ['|browser| src/a.test.ts'],
					ranFiles: ['|browser| src/a.test.ts'],
					selects: 'all',
					name: 'browser',
				}),
			],
		})

		expect(openOf(foldGateRecords({ previous: undefined, records: [both] }))).toEqual([
			'|browser| src/a.test.ts',
		])
	})
})

describe('foldGateRecords - nameless and unknown failures', () => {
	/** The part a failed `changedOnly` step naming no key leaves, having run `ranFiles`. */
	function namelessPart(ranFiles: string[]): TestsRecordGate | undefined {
		return foldGateRecords({
			previous: undefined,
			records: [
				record({ at: 'T10', steps: [failedStep({ keys: [], ranFiles, selects: 'changed' })] }),
			],
		})
	}

	it('a failed step naming no key -> one nameless entry, kept in the record that opens it', () => {
		expect(namelessPart([KEY])?.failures).toEqual([
			{
				key: null,
				mode: 'fast',
				head: HEAD_A,
				stateHash: TREE_A,
				at: 'T10',
				ranFiles: [KEY],
				failed: 1,
			},
		])
	})

	it.each([
		{
			what: 'a --changed pass of another file',
			step: passedStep({ ranFiles: [OTHER_KEY], selects: 'changed' }),
			open: ['nameless'],
		},
		{
			what: 'a pass under another HEAD that ran the failing run’s keys',
			step: passedStep({ ranFiles: [KEY, OTHER_KEY], selects: 'changed' }),
			open: [],
		},
		{ what: 'a whole-suite pass', step: passedStep({ ranFiles: [], selects: 'all' }), open: [] },
	])('a nameless failure that ran the key, then $what -> $open', ({ step, open }) => {
		const next = record({ at: 'T11', head: HEAD_B, steps: [step] })

		expect(openOf(foldGateRecords({ previous: namelessPart([KEY]), records: [next] }))).toEqual(
			open,
		)
	})

	it('a nameless failure with no ran keys, then a scoped pass -> kept; then a whole-suite pass -> cleared', () => {
		const kept = foldGateRecords({
			previous: namelessPart([]),
			records: [record({ at: 'T11', steps: [passedStep({ ranFiles: [KEY] })] })],
		})
		const cleared = foldGateRecords({
			previous: kept,
			records: [
				record({ mode: 'full', at: 'T12', steps: [passedStep({ ranFiles: [], selects: 'all' })] }),
			],
		})

		expect({ kept: openOf(kept), cleared: openOf(cleared) }).toEqual({
			kept: ['nameless'],
			cleared: [],
		})
	})

	it('an unknown entry, then a scoped pass -> kept; then a whole-suite pass with a skipped tdd step -> cleared', () => {
		const seeded = seededGatePart({
			why: 'tests.json is not JSON',
			at: 'T09',
			head: HEAD_A,
			stateHash: TREE_A,
		})
		const kept = foldGateRecords({
			previous: seeded,
			records: [record({ at: 'T10', steps: [passedStep({ ranFiles: [KEY] })] })],
		})
		const cleared = foldGateRecords({
			previous: kept,
			records: [
				record({
					mode: 'full',
					at: 'T11',
					steps: [
						{ name: 'tdd', status: 'skipped', counts: {} },
						passedStep({ ranFiles: [KEY], selects: 'all' }),
					],
				}),
			],
		})

		expect({ kept: openOf(kept), cleared: openOf(cleared) }).toEqual({
			kept: ['unknown'],
			cleared: [],
		})
	})

	it.each([
		{
			what: 'core-shaped steps passing against the merge-base',
			base: { commit: HEAD_A, source: 'base-branch' as const },
			open: ['unknown'],
		},
		{
			what: 'the same steps of a release run against the empty tree',
			base: { commit: 'e'.repeat(40), source: 'release' as const },
			open: [],
		},
	])('an unknown entry, then $what -> $open', ({ base, open }) => {
		const coreShaped = record({
			mode: 'full',
			at: 'T10',
			base,
			steps: [
				passedStep({ ranFiles: [KEY], selects: 'all', name: 'node tests' }),
				passedStep({
					ranFiles: ['|browser| src/a.test.ts'],
					selects: 'scoped',
					name: 'browser tests',
				}),
			],
		})
		const seeded = seededGatePart({
			why: 'tests.json is not JSON',
			at: 'T09',
			head: HEAD_A,
			stateHash: TREE_A,
		})

		expect(openOf(foldGateRecords({ previous: seeded, records: [coreShaped] }))).toEqual(open)
	})

	it('a step whose selects reads no known word -> never a whole-suite pass', () => {
		const odd = { ...passedStep({ ranFiles: [KEY] }), selects: 'some' } as unknown as RecordedStep
		const seeded = seededGatePart({
			why: 'tests.json is not JSON',
			at: 'T09',
			head: HEAD_A,
			stateHash: TREE_A,
		})

		expect(
			openOf(
				foldGateRecords({
					previous: seeded,
					records: [record({ mode: 'full', at: 'T10', steps: [odd] })],
				}),
			),
		).toEqual(['unknown'])
	})
})

describe('foldGateRecords - a part an older cli wrote', () => {
	it('no failures field and a failed test counted, then a scoped pass that leaves the file out -> an unknown entry kept', () => {
		const older: TestsRecordGate = {
			mode: 'fast',
			at: 'T10',
			head: HEAD_A,
			stateHash: TREE_A,
			tests: FAILED_COUNTS.tests,
		}

		expect(
			openOf(
				foldGateRecords({
					previous: older,
					records: [record({ at: 'T11', steps: [passedStep({ ranFiles: [OTHER_KEY] })] })],
				}),
			),
		).toEqual(['unknown'])
	})

	it('an older cli’s record (counts, failing files, no ran keys) -> opens from its failed step, clears nothing', () => {
		const olderRecord = record({
			at: 'T11',
			steps: [
				{ name: 'tests', status: 'failed', counts: FAILED_COUNTS, failing: ['src/b.test.ts'] },
			],
		})

		expect(openOf(foldGateRecords({ previous: failingPart(), records: [olderRecord] }))).toEqual([
			KEY,
			'src/b.test.ts',
		])
	})
})

describe('seededGatePart', () => {
	it('a why, a time and a tree -> a part with no mode, no counts and one unknown entry', () => {
		expect(
			seededGatePart({ why: 'tests.json is not JSON', at: 'T09', head: HEAD_A, stateHash: TREE_A }),
		).toEqual({
			mode: null,
			at: 'T09',
			head: HEAD_A,
			stateHash: TREE_A,
			failures: [{ key: null, unknown: 'tests.json is not JSON', at: 'T09' }],
		})
	})
})
