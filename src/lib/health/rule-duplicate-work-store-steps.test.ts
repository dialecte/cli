import {
	AFTER_NOW_AT,
	AN_ORIGIN,
	BEFORE_WINDOW_GREEN_AT,
	BEFORE_WINDOW_RERUN_AT,
	LONG_RUN,
	RERUN_AT,
	SAME_KEY_TEXT,
	STEP_HASH_ONE,
	STEP_HASH_TWO,
	WINDOW,
} from '../../../test/health.constants.ts'
import {
	commonOfStoreCase,
	greenFullNew,
	greenHook,
	newShapeSteps,
	recordOf,
	reRunSummary,
	rerunHook,
	rerunHookGate,
	stepOf,
	summarizeFindings,
} from '../../../test/health.ts'
import { readHealthRepository } from './read-health-context.ts'
import { findDuplicateWork } from './rule-duplicate-work.ts'

import { describe, expect, it } from 'vitest'

import type { StoreCase } from '../../../test/health.types.ts'

const UNKNOWN = { took: 'for an unknown time', last: SAME_KEY_TEXT, lot: undefined }

const rows: StoreCase[] = [
	{
		name: 'the later record is reused as a whole → no finding',
		records: [greenHook(), recordOf({ mode: 'hook', at: RERUN_AT, reused: AN_ORIGIN })],
		runs: [LONG_RUN],
		expected: [],
	},
	{
		name: 'every step of the later record is reused → no finding',
		records: [
			greenFullNew(),
			rerunHookGate({
				steps: [stepOf({ name: 'tests', stepHash: STEP_HASH_ONE, reused: AN_ORIGIN })],
			}),
		],
		runs: [LONG_RUN],
		expected: [],
	},
	{
		name: 'old shape, one step reused and `check` ran → red (only a record whose every step is reused is skipped)',
		records: [
			greenHook(),
			recordOf({
				mode: 'hook',
				at: RERUN_AT,
				steps: [stepOf({ name: 'check' }), stepOf({ name: 'test:hook', reused: AN_ORIGIN })],
			}),
		],
		runs: [LONG_RUN],
		expected: [reRunSummary({ last: SAME_KEY_TEXT })],
	},
	{
		name: 'new shape, the `tests` step reused and a step of another hash ran → no finding (what ran has no green twin)',
		records: [
			greenFullNew(),
			rerunHookGate({
				steps: [
					stepOf({ name: 'tests', stepHash: STEP_HASH_ONE, reused: AN_ORIGIN }),
					stepOf({ name: 'check', stepHash: STEP_HASH_TWO }),
				],
			}),
		],
		runs: [LONG_RUN],
		expected: [],
	},
	{
		name: 'the re-run is before the window → no finding',
		records: [
			recordOf({ mode: 'hook', at: BEFORE_WINDOW_GREEN_AT }),
			recordOf({ mode: 'hook', at: BEFORE_WINDOW_RERUN_AT }),
		],
		runs: [LONG_RUN],
		rerunAt: BEFORE_WINDOW_RERUN_AT,
		expected: [],
	},
	{
		name: 'the re-run is after now → no finding',
		records: [greenHook(), recordOf({ mode: 'hook', at: AFTER_NOW_AT })],
		runs: [LONG_RUN],
		rerunAt: AFTER_NOW_AT,
		expected: [],
	},
	{
		name: 'the green record is before the window, the re-run in it → red (the window applies to the re-run only)',
		records: [recordOf({ mode: 'hook', at: BEFORE_WINDOW_GREEN_AT }), rerunHook()],
		runs: [LONG_RUN],
		expected: [reRunSummary({ greenAt: BEFORE_WINDOW_GREEN_AT, last: SAME_KEY_TEXT })],
	},
	{
		name: 'a hook re-run with no run in the events, `test:hook` ran → red, ran for an unknown time',
		records: [greenHook(), rerunHook()],
		expected: [reRunSummary(UNKNOWN)],
	},
	{
		name: 'a new-shape hook-gate re-run with no run, `tests` ran → red',
		records: [greenFullNew(), rerunHookGate({ steps: newShapeSteps(STEP_HASH_ONE) })],
		expected: [reRunSummary({ ...UNKNOWN, rerunMode: 'hook-gate', greenMode: 'full' })],
	},
	{
		name: 'a re-run with no run, `test:hook` reused and `check` ran → amber (no test step ran)',
		records: [
			greenHook(),
			recordOf({
				mode: 'hook',
				at: RERUN_AT,
				steps: [stepOf({ name: 'check' }), stepOf({ name: 'test:hook', reused: AN_ORIGIN })],
			}),
		],
		expected: [reRunSummary({ ...UNKNOWN, severity: 'amber' })],
	},
	{
		name: 'a contrib re-run with no run in the events → amber (no test step ran)',
		records: [
			recordOf({ mode: 'contrib', at: '2026-11-15T01:00:00.000Z' }),
			recordOf({ mode: 'contrib', at: RERUN_AT }),
		],
		expected: [
			reRunSummary({ ...UNKNOWN, severity: 'amber', rerunMode: 'contrib', greenMode: 'contrib' }),
		],
	},
]

describe('findDuplicateWork, reused steps, the window and a re-run with no run', () => {
	for (const row of rows) {
		it(row.name, () => {
			expect(
				summarizeFindings(
					findDuplicateWork({
						repository: readHealthRepository({ common: commonOfStoreCase(row) }),
						window: WINDOW,
					}),
				),
			).toEqual(row.expected)
		})
	}
})
