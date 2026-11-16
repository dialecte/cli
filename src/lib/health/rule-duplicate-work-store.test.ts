import {
	AN_ORIGIN,
	COMMAND_TWO,
	GREEN_AT,
	HEALTH_LOT,
	LINKED_TWO,
	LOCK_TWO,
	LONG_RUN,
	MID_AT,
	OLDER_GREEN_AT,
	OTHER_TREE,
	RERUN_AT,
	SAME_KEY_TEXT,
	SHORT_RUN_MS,
	STEP_HASH_ONE,
	STEP_HASH_TWO,
	TREE_PREFIX,
	WINDOW,
} from '../../../test/health.constants.ts'
import {
	commonOfStoreCase,
	greenFullNew,
	greenHook,
	keyOf,
	newShapeSteps,
	recordOf,
	reRunSummary,
	rerunHook,
	rerunHookGate,
	summarizeFindings,
	writeHealthCommon,
} from '../../../test/health.ts'
import { readHealthRepository } from './read-health-context.ts'
import { findDuplicateWork } from './rule-duplicate-work.ts'

import { describe, expect, it } from 'vitest'

import type { StoreCase } from '../../../test/health.types.ts'
import type { GateRecord } from '../gate-records/gate-records.types.ts'

const reRunRows: StoreCase[] = [
	{
		name: 'old shape, hook then hook-gate, every key field equal → red, the reuse missed it',
		records: [greenHook(), recordOf({ mode: 'hook-gate', at: RERUN_AT })],
		runs: [LONG_RUN],
		expected: [reRunSummary({ rerunMode: 'hook-gate', last: SAME_KEY_TEXT })],
	},
	{
		name: 'new shape, full then hook-gate, same step hash, lock differs → red, differed install (command ignored)',
		records: [
			greenFullNew(),
			rerunHookGate({
				steps: newShapeSteps(STEP_HASH_ONE),
				key: { lockHash: LOCK_TWO, commandHash: COMMAND_TWO },
			}),
		],
		runs: [LONG_RUN],
		expected: [
			reRunSummary({ rerunMode: 'hook-gate', greenMode: 'full', last: 'differed: install' }),
		],
	},
	{
		name: 'new shape, same step hash, same lock and linked, other command → red, the reuse missed it',
		records: [
			greenFullNew(),
			rerunHookGate({ steps: newShapeSteps(STEP_HASH_ONE), key: { commandHash: COMMAND_TWO } }),
		],
		runs: [LONG_RUN],
		expected: [reRunSummary({ rerunMode: 'hook-gate', greenMode: 'full', last: SAME_KEY_TEXT })],
	},
	{
		name: 'old shape, linked differs → differed linked',
		records: [greenHook(), rerunHook({ linked: LINKED_TWO })],
		runs: [LONG_RUN],
		expected: [reRunSummary({ last: 'differed: linked' })],
	},
	{
		name: 'old shape, command differs → differed command',
		records: [greenHook(), rerunHook({ commandHash: COMMAND_TWO })],
		runs: [LONG_RUN],
		expected: [reRunSummary({ last: 'differed: command' })],
	},
	{
		name: 'old shape, install and command differ → differed install, command',
		records: [greenHook(), rerunHook({ lockHash: LOCK_TWO, commandHash: COMMAND_TWO })],
		runs: [LONG_RUN],
		expected: [reRunSummary({ last: 'differed: install, command' })],
	},
	{
		name: 'old shape, all three differ → parts in the order install, linked, command',
		records: [
			greenHook(),
			rerunHook({ lockHash: LOCK_TWO, linked: LINKED_TWO, commandHash: COMMAND_TWO }),
		],
		runs: [LONG_RUN],
		expected: [reRunSummary({ last: 'differed: install, linked, command' })],
	},
	{
		name: 'a contrib re-run of 4 s, command differs → amber',
		records: [
			recordOf({ mode: 'contrib', at: GREEN_AT }),
			recordOf({ mode: 'contrib', at: RERUN_AT, key: keyOf({ commandHash: COMMAND_TWO }) }),
		],
		runs: [{ step: 'contrib', durationMs: SHORT_RUN_MS }],
		expected: [
			reRunSummary({
				severity: 'amber',
				rerunMode: 'contrib',
				greenMode: 'contrib',
				took: '4.0 s',
				last: 'differed: command',
			}),
		],
	},
	{
		name: 'a re-run of exactly 5 minutes → red',
		records: [greenHook(), rerunHook()],
		runs: [{ step: 'gate-hook', durationMs: 300_000 }],
		expected: [reRunSummary({ took: '5 m 0 s', last: SAME_KEY_TEXT })],
	},
	{
		name: 'a re-run just under 5 minutes → amber',
		records: [
			recordOf({ mode: 'contrib', at: GREEN_AT }),
			recordOf({ mode: 'contrib', at: RERUN_AT }),
		],
		runs: [{ step: 'contrib', durationMs: 299_999 }],
		expected: [
			reRunSummary({
				severity: 'amber',
				rerunMode: 'contrib',
				greenMode: 'contrib',
				took: '4 m 59 s',
				last: SAME_KEY_TEXT,
			}),
		],
	},
	{
		name: 'a run that ended 60 s before the record → that run is the record’s run',
		records: [greenHook(), rerunHook()],
		runs: [{ ...LONG_RUN, endedBeforeMs: 60_000 }],
		expected: [reRunSummary({ last: SAME_KEY_TEXT })],
	},
	{
		name: 'a run that ended 60.001 s before the record → not its run, unknown time',
		records: [greenHook(), rerunHook()],
		runs: [{ ...LONG_RUN, endedBeforeMs: 60_001 }],
		expected: [reRunSummary({ took: 'for an unknown time', last: SAME_KEY_TEXT, lot: undefined })],
	},
	{
		name: 'the run’s end carries another key than the record → not its run, unknown time',
		records: [greenHook(), rerunHook()],
		runs: [{ ...LONG_RUN, key: keyOf({ lockHash: LOCK_TWO }) }],
		expected: [reRunSummary({ took: 'for an unknown time', last: SAME_KEY_TEXT, lot: undefined })],
	},
	{
		name: 'two runs hold the record’s time → the one whose end is closest to it, though it started earlier',
		records: [greenHook(), rerunHook()],
		runs: [
			{ step: 'gate-hook', durationMs: 293_000 },
			{ step: 'gate-hook', durationMs: 200_000, endedBeforeMs: 30_000 },
		],
		expected: [reRunSummary({ severity: 'amber', took: '4 m 53 s', last: SAME_KEY_TEXT })],
	},
	{
		name: 'two green records qualify, the newest written first → the newest is named',
		records: [
			recordOf({ mode: 'hook-gate', at: GREEN_AT, reused: AN_ORIGIN }),
			recordOf({ mode: 'hook', at: OLDER_GREEN_AT }),
			rerunHook(),
		],
		runs: [LONG_RUN],
		expected: [reRunSummary({ greenMode: 'hook-gate', last: SAME_KEY_TEXT })],
	},
]

const nothingRows: StoreCase[] = [
	{
		name: 'the earlier record failed → no finding',
		records: [
			recordOf({
				mode: 'hook',
				at: GREEN_AT,
				steps: [
					{ name: 'check', status: 'passed', counts: {} },
					{ name: 'test:hook', status: 'failed', counts: {} },
				],
			}),
			rerunHook(),
		],
		runs: [LONG_RUN],
		expected: [],
	},
	{
		name: 'the earlier record is newer than the re-run’s start → no finding',
		records: [recordOf({ mode: 'hook', at: MID_AT }), rerunHook()],
		runs: [LONG_RUN],
		expected: [],
	},
	{
		name: 'the earlier record is of another tree → no finding',
		records: [
			recordOf({ mode: 'hook', at: GREEN_AT, key: keyOf({ tree: OTHER_TREE }) }),
			rerunHook(),
		],
		runs: [LONG_RUN],
		expected: [],
	},
	{
		name: 'full then hook, old shape → no finding (not comparable)',
		records: [recordOf({ mode: 'full', at: GREEN_AT }), rerunHook()],
		runs: [LONG_RUN],
		expected: [],
	},
	{
		name: 'new shape, the step hash differs → no finding',
		records: [greenFullNew(), rerunHookGate({ steps: newShapeSteps(STEP_HASH_TWO) })],
		runs: [LONG_RUN],
		expected: [],
	},
]

/** A hook record of the other tree at `at`. */
function otherTreeHook(at: string): GateRecord {
	return recordOf({ mode: 'hook', at, key: keyOf({ tree: OTHER_TREE }) })
}

describe('findDuplicateWork, store pairs', () => {
	for (const row of [...reRunRows, ...nothingRows]) {
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

	it('a rehearsal green record and a later re-run → the finding names both keys, in three detail lines', () => {
		const common = commonOfStoreCase({
			name: 'detail',
			records: [
				recordOf({ mode: 'hook', at: GREEN_AT, origin: 'rehearsal' }),
				rerunHook({ lockHash: LOCK_TWO }),
			],
			runs: [LONG_RUN],
			expected: [],
		})

		expect(
			findDuplicateWork({ repository: readHealthRepository({ common }), window: WINDOW }),
		).toEqual([
			{
				rule: 'duplicate-work',
				severity: 'red',
				repository: 'cli',
				lot: HEALTH_LOT,
				at: RERUN_AT,
				text: `tree ${TREE_PREFIX}: hook ran 10 m 0 s although a green hook record existed (${GREEN_AT}, rehearsal)`,
				detail: [
					`green  hook ${GREEN_AT} rehearsal  install a1a1a1a1a1a1  command c3c3c3c3c3c3  linked e5e5e5e5e5e5`,
					`re-run hook ${RERUN_AT}  install b2b2b2b2b2b2  command c3c3c3c3c3c3  linked e5e5e5e5e5e5`,
					'differed: install',
				],
			},
		])
	})

	it('a green record of no origin and a later re-run → no `rehearsal` anywhere in the finding', () => {
		const common = commonOfStoreCase({
			name: 'detail without origin',
			records: [greenHook(), rerunHook({ commandHash: COMMAND_TWO })],
			runs: [LONG_RUN],
			expected: [],
		})

		expect(
			findDuplicateWork({ repository: readHealthRepository({ common }), window: WINDOW }),
		).toEqual([
			{
				rule: 'duplicate-work',
				severity: 'red',
				repository: 'cli',
				lot: HEALTH_LOT,
				at: RERUN_AT,
				text: `tree ${TREE_PREFIX}: hook ran 10 m 0 s although a green hook record existed (${GREEN_AT})`,
				detail: [
					`green  hook ${GREEN_AT}  install a1a1a1a1a1a1  command c3c3c3c3c3c3  linked e5e5e5e5e5e5`,
					`re-run hook ${RERUN_AT}  install a1a1a1a1a1a1  command d4d4d4d4d4d4  linked e5e5e5e5e5e5`,
					'differed: command',
				],
			},
		])
	})

	it('two trees re-run, the earlier finding on the tree written second → findings sorted by time, oldest first', () => {
		const common = writeHealthCommon({
			records: [
				rerunHook(),
				greenHook(),
				otherTreeHook('2026-11-15T01:30:00.000Z'),
				otherTreeHook('2026-11-15T02:00:00.000Z'),
			],
		})

		expect(
			findDuplicateWork({ repository: readHealthRepository({ common }), window: WINDOW }).map(
				(finding) => finding.at,
			),
		).toEqual(['2026-11-15T02:00:00.000Z', RERUN_AT])
	})
})
