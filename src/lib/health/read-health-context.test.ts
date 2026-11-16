import { join } from 'node:path'

import {
	GREEN_AT,
	LOCK_TWO,
	HEALTH_LOT,
	OTHER_TREE,
	REHEARSAL_PLAN_AT,
	REHEARSAL_REASON,
	RERUN_AT,
	SHORT_RUN_MS,
} from '../../../test/health.constants.ts'
import {
	createCommon,
	keyOf,
	recordOf,
	rehearsalPlanOf,
	runBeforeRecord,
	writeHealthCommon,
} from '../../../test/health.ts'
import { readHealthRepository } from './read-health-context.ts'

import { describe, expect, it } from 'vitest'

import type { HealthLotInput } from '../../../test/health.types.ts'
import type { GateRecord } from '../gate-records/gate-records.types.ts'
import type { HealthRepository } from './health.types.ts'

const FIRST_LOT = '0101-cli-first'
const SECOND_LOT = '0102-cli-second'

const FIRST_EVENTS = runBeforeRecord({
	lot: FIRST_LOT,
	run: 'run-a',
	step: 'gate-hook',
	durationMs: SHORT_RUN_MS,
	recordAt: RERUN_AT,
})

function byAt(first: GateRecord, second: GateRecord): number {
	return first.at.localeCompare(second.at)
}

/** The repository with its records sorted by time: the order of the store files is not pinned. */
function withSortedRecords(repository: HealthRepository) {
	return {
		name: repository.name,
		common: repository.common,
		lots: repository.lots,
		records: [...repository.records].sort(byAt),
	}
}

describe('readHealthRepository', () => {
	it('a common dir with lots and store files → the repository named after the folder above it, every lot and record', () => {
		const plan = rehearsalPlanOf({
			at: REHEARSAL_PLAN_AT,
			decision: 'rehearsed',
			reason: REHEARSAL_REASON,
		})
		const records = [
			recordOf({ mode: 'hook', at: GREEN_AT }),
			recordOf({ mode: 'contrib', at: RERUN_AT, key: keyOf({ tree: OTHER_TREE }) }),
		]
		const common = writeHealthCommon({
			records,
			lots: [
				// the end is written before the start: the reader sorts
				{ name: FIRST_LOT, events: [...FIRST_EVENTS].reverse() },
				{ name: SECOND_LOT, rehearsal: plan },
			],
		})

		expect(withSortedRecords(readHealthRepository({ common }))).toEqual({
			name: 'cli',
			common,
			lots: [
				{
					name: FIRST_LOT,
					folder: join(common, 'dialecte-lots', FIRST_LOT),
					events: FIRST_EVENTS,
					runs: [{ run: 'run-a', start: FIRST_EVENTS[0], end: FIRST_EVENTS[1] }],
				},
				{
					name: SECOND_LOT,
					folder: join(common, 'dialecte-lots', SECOND_LOT),
					events: [],
					runs: [],
					rehearsal: plan,
				},
			],
			records: [...records].sort(byAt),
		})
	})

	it('no lots folder and no store folder → no lots and no records', () => {
		const common = createCommon()

		expect(readHealthRepository({ common })).toEqual({
			name: 'cli',
			common,
			lots: [],
			records: [],
			worktrees: [],
		})
	})

	it('a broken store file → skipped, the records of the others read', () => {
		const kept = recordOf({ mode: 'hook', at: GREEN_AT })
		const common = writeHealthCommon({ records: [kept], brokenStoreFiles: [OTHER_TREE] })

		expect(readHealthRepository({ common }).records).toEqual([kept])
	})

	it('a step.end carrying a check key → the lot’s event keeps the key as written', () => {
		const events = runBeforeRecord({
			lot: FIRST_LOT,
			run: 'run-key',
			step: 'gate-full',
			durationMs: SHORT_RUN_MS,
			recordAt: RERUN_AT,
			key: keyOf({ lockHash: LOCK_TWO }),
		})
		const common = writeHealthCommon({ lots: [{ name: FIRST_LOT, events }] })

		expect(
			readHealthRepository({ common }).lots.flatMap((lot) => lot.events.map((event) => event.key)),
		).toEqual([undefined, keyOf({ lockHash: LOCK_TWO })])
	})

	it('a broken event line → skipped, the events around it read', () => {
		const common = writeHealthCommon({
			lots: [
				{
					name: FIRST_LOT,
					events: FIRST_EVENTS,
					rawLineAmong: { index: 1, line: '{"at": "2026-11-15T03:00:00.000Z", "ki' },
				},
			],
		})

		expect(readHealthRepository({ common }).lots.map((lot) => lot.events)).toEqual([FIRST_EVENTS])
	})

	const otherShapes: { name: string; lot: HealthLotInput }[] = [
		{ name: 'an array', lot: { name: HEALTH_LOT, rehearsal: [] } },
		{
			name: 'an object whose lots is no array',
			lot: { name: HEALTH_LOT, rehearsal: { at: REHEARSAL_PLAN_AT, lots: 'none' } },
		},
		{
			name: 'an object whose at is no string',
			lot: { name: HEALTH_LOT, rehearsal: { at: 5, lots: [] } },
		},
		{ name: 'text that is not JSON', lot: { name: HEALTH_LOT, rehearsalText: '{"at": ' } },
	]
	for (const row of otherShapes) {
		it(`a rehearsal.json holding ${row.name} → the lot has no rehearsal plan`, () => {
			const common = writeHealthCommon({ lots: [row.lot] })

			expect(readHealthRepository({ common }).lots.map((lot) => lot.rehearsal)).toEqual([undefined])
		})
	}
})
