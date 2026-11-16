import {
	BEFORE_WINDOW_GREEN_AT,
	BEFORE_WINDOW_RERUN_AT,
	GREEN_AT,
	HEALTH_LOT,
	LOCK_TWO,
	LONG_RUN_MS,
	OTHER_LOT,
	RERUN_AT,
	SAME_KEY_TEXT,
	SHORT_RUN_MS,
	STATE_ONE,
	STATE_ONE_PREFIX,
	STATE_TWO,
	TREE_PREFIX,
	WINDOW,
} from '../../../test/health.constants.ts'
import {
	keyOf,
	reRunSummary,
	recordOf,
	runBeforeRecord,
	summarizeFindings,
	writeHealthCommon,
} from '../../../test/health.ts'
import { readHealthRepository } from './read-health-context.ts'
import { findDuplicateWork } from './rule-duplicate-work.ts'

import { describe, expect, it } from 'vitest'

import type { FindingSummary, RunSpec } from '../../../test/health.types.ts'
import type { LotEvent } from '../events/event.types.ts'
type EventRow = {
	name: string
	first: RunSpec
	second: RunSpec
	firstLot?: string
	secondLot?: string
	firstAt?: string
	secondAt?: string
	expected: FindingSummary[]
}

function gateFullRun(overrides: Partial<RunSpec> = {}): RunSpec {
	return {
		step: 'gate-full',
		durationMs: LONG_RUN_MS,
		stateHash: STATE_ONE,
		key: keyOf(),
		reuse: 'none',
		...overrides,
	}
}

const KEY_LINE = `key  tree ${TREE_PREFIX}  install a1a1a1a1a1a1  command c3c3c3c3c3c3  linked e5e5e5e5e5e5`

function againSummary(params: {
	severity: 'red' | 'amber'
	took: string
	step?: string
	lot?: string
}): FindingSummary {
	const { severity, took, step = 'gate-full', lot = HEALTH_LOT } = params
	return {
		severity,
		text: `state ${STATE_ONE_PREFIX}: ${step} ran ${took} again with the same key as at ${GREEN_AT}`,
		last: KEY_LINE,
		lot,
	}
}

const FIRST_SHORT = { durationMs: 5_000 }

const eventRows: EventRow[] = [
	{
		name: 'two gate-full ends, one state hash, equal keys, 10 min → red',
		first: gateFullRun(FIRST_SHORT),
		second: gateFullRun(),
		expected: [againSummary({ severity: 'red', took: '10 m 0 s' })],
	},
	{
		name: 'the same at 4 s → amber',
		first: gateFullRun(FIRST_SHORT),
		second: gateFullRun({ durationMs: SHORT_RUN_MS }),
		expected: [againSummary({ severity: 'amber', took: '4.0 s' })],
	},
	{
		name: 'a gate-hook pair → finding',
		first: gateFullRun({ ...FIRST_SHORT, step: 'gate-hook' }),
		second: gateFullRun({ step: 'gate-hook' }),
		expected: [againSummary({ severity: 'red', took: '10 m 0 s', step: 'gate-hook' })],
	},
	{
		name: 'a contrib pair → finding',
		first: gateFullRun({ ...FIRST_SHORT, step: 'contrib' }),
		second: gateFullRun({ step: 'contrib' }),
		expected: [againSummary({ severity: 'red', took: '10 m 0 s', step: 'contrib' })],
	},
	{
		name: 'a rehearsal pair with a state hash and a key → no finding (not a check step)',
		first: gateFullRun({ ...FIRST_SHORT, step: 'rehearsal' }),
		second: gateFullRun({ step: 'rehearsal' }),
		expected: [],
	},
	{
		name: 'the two ends are in two lots of the repository → finding, in the second end’s lot',
		first: gateFullRun(FIRST_SHORT),
		second: gateFullRun(),
		secondLot: OTHER_LOT,
		expected: [againSummary({ severity: 'red', took: '10 m 0 s', lot: OTHER_LOT })],
	},
	{
		name: 'no key on either end → no finding',
		first: gateFullRun({ ...FIRST_SHORT, key: undefined }),
		second: gateFullRun({ key: undefined }),
		expected: [],
	},
	{
		name: 'a key on the second end only → no finding',
		first: gateFullRun({ ...FIRST_SHORT, key: undefined }),
		second: gateFullRun(),
		expected: [],
	},
	{
		name: 'a key on the first end only → no finding',
		first: gateFullRun(FIRST_SHORT),
		second: gateFullRun({ key: undefined }),
		expected: [],
	},
	{
		name: 'the keys differ → no finding',
		first: gateFullRun(FIRST_SHORT),
		second: gateFullRun({ key: keyOf({ lockHash: LOCK_TWO }) }),
		expected: [],
	},
	{
		name: 'the state hashes differ → no finding',
		first: gateFullRun(FIRST_SHORT),
		second: gateFullRun({ stateHash: STATE_TWO }),
		expected: [],
	},
	{
		name: 'both state hashes null, equal keys → no finding',
		first: gateFullRun({ ...FIRST_SHORT, stateHash: null }),
		second: gateFullRun({ stateHash: null }),
		expected: [],
	},
	{
		name: 'the second end answered from a record (reuse whole) → no finding',
		first: gateFullRun(FIRST_SHORT),
		second: gateFullRun({ reuse: 'whole' }),
		expected: [],
	},
	{
		name: 'the first end failed → no finding',
		first: gateFullRun({ ...FIRST_SHORT, exit: 1 }),
		second: gateFullRun(),
		expected: [],
	},
	{
		name: 'the second end failed → no finding',
		first: gateFullRun(FIRST_SHORT),
		second: gateFullRun({ exit: 1 }),
		expected: [],
	},
	{
		name: 'the second end is before the window → no finding',
		first: gateFullRun(FIRST_SHORT),
		second: gateFullRun(),
		firstAt: BEFORE_WINDOW_GREEN_AT,
		secondAt: BEFORE_WINDOW_RERUN_AT,
		expected: [],
	},
]

function lotsOfRow(row: EventRow): { name: string; events: LotEvent[] }[] {
	const firstLot = row.firstLot ?? HEALTH_LOT
	const secondLot = row.secondLot ?? HEALTH_LOT
	const first = runBeforeRecord({
		...row.first,
		lot: firstLot,
		run: 'first',
		recordAt: row.firstAt ?? GREEN_AT,
		endedBeforeMs: 0,
	})
	const second = runBeforeRecord({
		...row.second,
		lot: secondLot,
		run: 'second',
		recordAt: row.secondAt ?? RERUN_AT,
	})
	if (firstLot === secondLot) return [{ name: firstLot, events: [...first, ...second] }]
	return [
		{ name: firstLot, events: first },
		{ name: secondLot, events: second },
	]
}

function commonOfEvents(row: EventRow): string {
	return writeHealthCommon({ lots: lotsOfRow(row) })
}

describe('findDuplicateWork, identical-key re-runs in the events', () => {
	for (const row of eventRows) {
		it(row.name, () => {
			expect(
				summarizeFindings(
					findDuplicateWork({
						repository: readHealthRepository({ common: commonOfEvents(row) }),
						window: WINDOW,
					}),
				),
			).toEqual(row.expected)
		})
	}

	it('an identical-key re-run → the whole finding: the second end’s time and lot, one key line', () => {
		const row: EventRow = {
			name: 'whole finding',
			first: gateFullRun(FIRST_SHORT),
			second: gateFullRun(),
			expected: [],
		}

		expect(
			findDuplicateWork({
				repository: readHealthRepository({ common: commonOfEvents(row) }),
				window: WINDOW,
			}),
		).toEqual([
			{
				rule: 'duplicate-work',
				severity: 'red',
				repository: 'cli',
				lot: HEALTH_LOT,
				at: '2026-11-15T02:09:58.000Z',
				text: `state ${STATE_ONE_PREFIX}: gate-full ran 10 m 0 s again with the same key as at ${GREEN_AT}`,
				detail: [KEY_LINE],
			},
		])
	})

	it('a run the store pair also names → the store pair only', () => {
		const row: EventRow = {
			name: 'dedupe',
			first: gateFullRun(FIRST_SHORT),
			second: gateFullRun(),
			expected: [],
		}
		const common = writeHealthCommon({
			records: [recordOf({ mode: 'full', at: GREEN_AT }), recordOf({ mode: 'full', at: RERUN_AT })],
			lots: lotsOfRow(row),
		})

		expect(
			summarizeFindings(
				findDuplicateWork({ repository: readHealthRepository({ common }), window: WINDOW }),
			),
		).toEqual([
			reRunSummary({
				severity: 'red',
				rerunMode: 'full',
				greenMode: 'full',
				took: '10 m 0 s',
				last: SAME_KEY_TEXT,
			}),
		])
	})
})
