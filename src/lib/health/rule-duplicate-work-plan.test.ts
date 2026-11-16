import {
	BEFORE_WINDOW_EARLIER_GREEN_AT,
	BEFORE_WINDOW_REHEARSAL_END_AT,
	BEFORE_WINDOW_REHEARSAL_PLAN_AT,
	BEFORE_WINDOW_REHEARSAL_START_AT,
	GREEN_AT,
	HEALTH_LOT,
	MID_AT,
	OLDER_GREEN_AT,
	OTHER_TREE,
	PLAN_LOT,
	REHEARSAL_PLAN_BEFORE_GREEN_AT,
	REHEARSAL_SHORT_END_AT,
	REHEARSAL_END_AT,
	REHEARSAL_PLAN_AT,
	REHEARSAL_REASON,
	REHEARSAL_START_AT,
	TREE_PREFIX,
	WINDOW,
} from '../../../test/health.constants.ts'
import {
	keyOf,
	recordOf,
	rehearsalPlanOf,
	stepRunEvents,
	summarizeFindings,
	writeHealthCommon,
} from '../../../test/health.ts'
import { readHealthRepository } from './read-health-context.ts'
import { findDuplicateWork } from './rule-duplicate-work.ts'

import { describe, expect, it } from 'vitest'

import type { FindingSummary } from '../../../test/health.types.ts'
import type { GateRecord } from '../gate-records/gate-records.types.ts'
type PlanRow = {
	name: string
	records: GateRecord[]
	decision: 'reused' | 'rehearsed'
	withRun?: boolean
	/** The rehearsal run and the plan's time, when not the defaults. */
	times?: { startAt: string; endAt: string; planAt: string }
	expected: FindingSummary[]
}

function rehearsalSummary(params: {
	mode: string
	severity?: 'red' | 'amber'
	took?: string
	greenAt?: string
}): FindingSummary {
	const { mode, severity = 'red', took = '10 m 0 s', greenAt = GREEN_AT } = params
	return {
		severity,
		text: `tree ${TREE_PREFIX}: the rehearsal re-ran lot ${PLAN_LOT} for ${took} although a green ${mode} record existed (${greenAt})`,
		last: 're-run key: not recorded',
		lot: HEALTH_LOT,
	}
}

const planRows: PlanRow[] = [
	{
		name: 'rehearsed, an older green hook record → red, the rehearsal re-ran the lot',
		records: [recordOf({ mode: 'hook', at: GREEN_AT })],
		decision: 'rehearsed',
		expected: [rehearsalSummary({ mode: 'hook' })],
	},
	{
		name: 'rehearsed, an older green full record → red',
		records: [recordOf({ mode: 'full', at: GREEN_AT })],
		decision: 'rehearsed',
		expected: [rehearsalSummary({ mode: 'full' })],
	},
	{
		name: 'rehearsed, an older green hook-gate record → red',
		records: [recordOf({ mode: 'hook-gate', at: GREEN_AT })],
		decision: 'rehearsed',
		expected: [rehearsalSummary({ mode: 'hook-gate' })],
	},
	{
		name: 'the decision is reused → no finding',
		records: [recordOf({ mode: 'hook', at: GREEN_AT })],
		decision: 'reused',
		expected: [],
	},
	{
		name: 'rehearsed, no green record of the tree → no finding',
		records: [],
		decision: 'rehearsed',
		expected: [],
	},
	{
		name: 'rehearsed, only a fast record before it → no finding',
		records: [recordOf({ mode: 'fast', at: GREEN_AT })],
		decision: 'rehearsed',
		expected: [],
	},
	{
		name: 'rehearsed, the green record is newer than the rehearsal’s start → no finding',
		records: [recordOf({ mode: 'hook', at: MID_AT })],
		decision: 'rehearsed',
		expected: [],
	},
	{
		name: 'rehearsed, no rehearsal run holds the plan’s time → no finding',
		records: [recordOf({ mode: 'hook', at: GREEN_AT })],
		decision: 'rehearsed',
		withRun: false,
		expected: [],
	},
	{
		name: 'rehearsed, the only green hook record is of another tree → no finding',
		records: [recordOf({ mode: 'hook', at: GREEN_AT, key: keyOf({ tree: OTHER_TREE }) })],
		decision: 'rehearsed',
		expected: [],
	},
	{
		name: 'rehearsed, a rehearsal run of 4 minutes → amber',
		records: [recordOf({ mode: 'hook', at: GREEN_AT })],
		decision: 'rehearsed',
		times: {
			startAt: REHEARSAL_START_AT,
			endAt: REHEARSAL_SHORT_END_AT,
			planAt: REHEARSAL_PLAN_AT,
		},
		expected: [rehearsalSummary({ mode: 'hook', severity: 'amber', took: '4 m 0 s' })],
	},
	{
		name: 'rehearsed, the green record is after the run’s start and before the plan’s time → no finding',
		records: [recordOf({ mode: 'hook', at: REHEARSAL_PLAN_BEFORE_GREEN_AT })],
		decision: 'rehearsed',
		expected: [],
	},
	{
		name: 'rehearsed, the run and the plan are before the window → no finding',
		records: [recordOf({ mode: 'hook', at: BEFORE_WINDOW_EARLIER_GREEN_AT })],
		decision: 'rehearsed',
		times: {
			startAt: BEFORE_WINDOW_REHEARSAL_START_AT,
			endAt: BEFORE_WINDOW_REHEARSAL_END_AT,
			planAt: BEFORE_WINDOW_REHEARSAL_PLAN_AT,
		},
		expected: [],
	},
	{
		name: 'rehearsed, two green records of the tree, the newest written first → the newest is named',
		records: [
			recordOf({ mode: 'full', at: GREEN_AT }),
			recordOf({ mode: 'hook', at: OLDER_GREEN_AT }),
		],
		decision: 'rehearsed',
		expected: [rehearsalSummary({ mode: 'full' })],
	},
]

function commonOfPlan(row: PlanRow): string {
	const events =
		row.withRun === false
			? []
			: stepRunEvents({
					lot: HEALTH_LOT,
					run: 'rehearsal-0',
					step: 'rehearsal',
					startAt: row.times?.startAt ?? REHEARSAL_START_AT,
					endAt: row.times?.endAt ?? REHEARSAL_END_AT,
				})
	const common = writeHealthCommon({
		records: row.records,
		lots: [
			{
				name: HEALTH_LOT,
				events,
				rehearsal: rehearsalPlanOf({
					at: row.times?.planAt ?? REHEARSAL_PLAN_AT,
					decision: row.decision,
					reason: REHEARSAL_REASON,
				}),
			},
		],
	})
	return common
}

describe('findDuplicateWork, rehearsal plan', () => {
	for (const row of planRows) {
		it(row.name, () => {
			expect(
				summarizeFindings(
					findDuplicateWork({
						repository: readHealthRepository({ common: commonOfPlan(row) }),
						window: WINDOW,
					}),
				),
			).toEqual(row.expected)
		})
	}

	it('a rehearsed lot → the finding is at the run’s start and names the plan’s reason', () => {
		const common = writeHealthCommon({
			records: [recordOf({ mode: 'hook', at: GREEN_AT })],
			lots: [
				{
					name: HEALTH_LOT,
					events: stepRunEvents({
						lot: HEALTH_LOT,
						run: 'rehearsal-0',
						step: 'rehearsal',
						startAt: REHEARSAL_START_AT,
						endAt: REHEARSAL_END_AT,
					}),
					rehearsal: rehearsalPlanOf({
						at: REHEARSAL_PLAN_AT,
						decision: 'rehearsed',
						reason: REHEARSAL_REASON,
					}),
				},
			],
		})

		expect(
			findDuplicateWork({ repository: readHealthRepository({ common }), window: WINDOW }).map(
				(finding) => ({ at: finding.at, detail: finding.detail }),
			),
		).toEqual([
			{
				at: REHEARSAL_START_AT,
				detail: [
					`rehearsal.json: lot ${PLAN_LOT} rehearsed - ${REHEARSAL_REASON}`,
					're-run key: not recorded',
				],
			},
		])
	})
})
