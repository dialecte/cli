/** The health reader never throws on one damaged file: it reads what it can and leaves the rest out. */
import { chmodSync } from 'node:fs'
import { join } from 'node:path'

import { HEALTH_LOT, RERUN_AT, SHORT_RUN_MS } from '../../../test/health.constants.ts'
import { runBeforeRecord, writeHealthCommon } from '../../../test/health.ts'
import { readHealthRepository } from './read-health-context.ts'

import { describe, expect, it } from 'vitest'

const PLAN_AT = '2026-11-15T02:00:02.000Z'
const NO_ACCESS = 0o000

const unholdingPlans = [
	{ name: 'a null among the lots', plan: { at: PLAN_AT, lots: [null] } },
	{ name: 'an empty object among the lots', plan: { at: PLAN_AT, lots: [{}] } },
	{
		name: 'a decision without its tree',
		plan: { at: PLAN_AT, lots: [{ lot: 1, decision: 'rehearsed', reason: 'moved' }] },
	},
]

describe('readHealthRepository on damaged files', () => {
	it('an events.jsonl that cannot be read → no throw, the lot reads with no events', () => {
		const common = writeHealthCommon({
			lots: [
				{
					name: HEALTH_LOT,
					events: runBeforeRecord({
						lot: HEALTH_LOT,
						run: 'run-0',
						step: 'gate-hook',
						durationMs: SHORT_RUN_MS,
						recordAt: RERUN_AT,
					}),
				},
			],
		})
		chmodSync(join(common, 'dialecte-lots', HEALTH_LOT, 'events.jsonl'), NO_ACCESS)

		expect(readHealthRepository({ common }).lots.map((lot) => [lot.name, lot.events])).toEqual([
			[HEALTH_LOT, []],
		])
	})

	it.each(unholdingPlans)('a rehearsal.json with $name → no plan, nothing thrown', ({ plan }) => {
		const common = writeHealthCommon({ lots: [{ name: HEALTH_LOT, rehearsal: plan }] })

		expect(readHealthRepository({ common }).lots.map((lot) => lot.rehearsal)).toEqual([undefined])
	})
})
