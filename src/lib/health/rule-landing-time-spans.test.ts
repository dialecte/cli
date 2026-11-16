import {
	AFTER_HR_END_AT,
	EARLIER_LOT,
	FIRST_HOOK,
	HANDOVER_ENDS_AFTER_NOW_AT,
	HANDOVER_ENDS_AFTER_SINCE_AT,
	HOOK_END_AT,
	HOOK_END_PAST_SLACK_AT,
	HOOK_END_PLUS_SLACK_AT,
	HOOK_INSIDE_OTHER_START_AT,
	HOOK_RAN_MS,
	HOOK_START_AT,
	HOOK_START_MINUS_ONE_AT,
	HR_EARLIEST_START_AT,
	HR_END_AT,
	HR_START_AT,
	HR_PREVIOUS_MS,
	HR_PREVIOUS_START_AT,
	JUST_BEFORE_HR_START_AT,
	LATER_HR_START_AT,
	NOT_REUSED_DETAIL,
	EARLIER_LOT_HOOK_IN_MAIN_SPAN_AT,
	OVER_BUDGET_MS,
	REHEARSAL_AFTER_PREVIOUS_AT,
	REHEARSAL_BEFORE_PREVIOUS_AT,
	REHEARSAL_BETWEEN_PREVIOUS_AT,
	REHEARSAL_ENDING_AFTER_HR_AT,
	REHEARSAL_LONG_MS,
	REHEARSAL_SHORT_MS,
	SECOND_HOOK,
	SECOND_HOOK_END_AT,
} from '../../../test/health-landing.constants.ts'
import {
	amberNotReused,
	duplicateFinding,
	findLandingsOfCase,
	landingFinding,
} from '../../../test/health-landing.ts'

import { describe, expect, it } from 'vitest'

import type { LandingCase } from '../../../test/health-landing.types.ts'

const RAN = { durationMs: HOOK_RAN_MS }
const REUSED = { durationMs: 24, reuse: 'whole' } as const
const DUPLICATE = `guards 20 s · lot ${FIRST_HOOK} hook ran 5 m 0 s - duplicate (see duplicate work)`
const HOOK_REUSED = `guards 20 s · lot ${FIRST_HOOK} hook reused`

function redDuplicate(): LandingCase['expected'] {
	return [landingFinding({ severity: 'red', handover: '6 m 40 s', detail: [DUPLICATE] })]
}

const cases: LandingCase[] = [
	{
		name: 'three hooks: one starting 1 ms before the run, one inside, one 1 ms after its end → only the inside one counts, guards to it',
		lot: {
			handoverMs: OVER_BUDGET_MS,
			hooks: [
				{ ...RAN, startAt: JUST_BEFORE_HR_START_AT },
				RAN,
				{ ...RAN, startAt: AFTER_HR_END_AT },
			],
		},
		expected: [amberNotReused()],
	},
	{
		name: 'exactly at the run start, a hook is counted → counted, guards 0.0 s',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [{ ...RAN, startAt: HR_START_AT }] },
		expected: [
			landingFinding({
				severity: 'amber',
				handover: '6 m 40 s',
				detail: [`guards 0.0 s · lot ${FIRST_HOOK} hook ran 5 m 0 s - not reused`],
			}),
		],
	},
	{
		name: 'exactly at the run end, a hook is counted → counted, guards are the whole run',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [{ ...RAN, startAt: HR_END_AT }] },
		expected: [
			landingFinding({
				severity: 'amber',
				handover: '6 m 40 s',
				detail: [`guards 6 m 40 s · lot ${FIRST_HOOK} hook ran 5 m 0 s - not reused`],
			}),
		],
	},
	{
		name: 'the hook that starts later is written first and ends first → numbered by start, the 5 m hook comes first',
		lot: {
			handoverMs: OVER_BUDGET_MS,
			hooks: [
				{ ...REUSED, startAt: HOOK_INSIDE_OTHER_START_AT },
				{ ...RAN, startAt: HOOK_START_AT },
			],
		},
		expected: [
			landingFinding({
				severity: 'amber',
				handover: '6 m 40 s',
				detail: [`${NOT_REUSED_DETAIL} · lot ${SECOND_HOOK} hook reused`],
			}),
		],
	},
	{
		name: 'two hooks, the second ran and was not reused → amber, the reused hook then the one that ran',
		lot: { handoverMs: 700_000, hooks: [REUSED, RAN] },
		expected: [
			landingFinding({
				severity: 'amber',
				handover: '11 m 40 s',
				detail: [
					`guards 20 s · lot ${FIRST_HOOK} hook reused · lot ${SECOND_HOOK} hook ran 5 m 0 s - not reused`,
				],
			}),
		],
	},
	{
		name: 'two hooks, a duplicate while the second ran → red on the second only',
		lot: { handoverMs: 700_000, hooks: [REUSED, RAN] },
		duplicates: [duplicateFinding({ at: SECOND_HOOK_END_AT })],
		expected: [
			landingFinding({
				severity: 'red',
				handover: '11 m 40 s',
				detail: [
					`guards 20 s · lot ${FIRST_HOOK} hook reused · lot ${SECOND_HOOK} hook ran 5 m 0 s - duplicate (see duplicate work)`,
				],
			}),
		],
	},
	{
		name: 'a duplicate of the lot while the hook ran → red, before the other reasons',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [{ ...RAN, outcome: 'interrupted' }] },
		duplicates: [duplicateFinding({ at: HOOK_END_AT })],
		expected: redDuplicate(),
	},
	{
		name: 'a duplicate of the lot a slack after the hook ended → red',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN] },
		duplicates: [duplicateFinding({ at: HOOK_END_PLUS_SLACK_AT })],
		expected: redDuplicate(),
	},
	{
		name: 'a duplicate of the lot past the slack → not a duplicate part',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN] },
		duplicates: [duplicateFinding({ at: HOOK_END_PAST_SLACK_AT })],
		expected: [amberNotReused()],
	},
	{
		name: 'a duplicate of the lot one millisecond before the hook started → not a duplicate part',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN] },
		duplicates: [duplicateFinding({ at: HOOK_START_MINUS_ONE_AT })],
		expected: [amberNotReused()],
	},
	{
		name: 'a duplicate of the lot exactly when the hook started → red',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN] },
		duplicates: [duplicateFinding({ at: HOOK_START_AT })],
		expected: redDuplicate(),
	},
	{
		name: 'a duplicate of another lot at the same time → not a duplicate part',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN] },
		duplicates: [duplicateFinding({ at: HOOK_END_AT, lot: EARLIER_LOT })],
		expected: [amberNotReused()],
	},
	{
		name: 'a stalled-run finding of the lot at the same time → not a duplicate part',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN] },
		duplicates: [duplicateFinding({ at: HOOK_END_AT, rule: 'stalled-run' })],
		expected: [amberNotReused()],
	},
	{
		name: 'one reused hook with a duplicate of the lot inside its window → amber, reused (not a duplicate part)',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [REUSED] },
		duplicates: [duplicateFinding({ at: HOOK_START_AT })],
		expected: [landingFinding({ severity: 'amber', handover: '6 m 40 s', detail: [HOOK_REUSED] })],
	},
	{
		name: 'rehearsals: one before the previous run, one after it, one that ends after the run starts → only the second',
		lot: {
			handoverMs: OVER_BUDGET_MS,
			hooks: [REUSED],
			previousHandovers: [{ startAt: HR_PREVIOUS_START_AT, durationMs: HR_PREVIOUS_MS }],
			rehearsals: [
				{ startAt: REHEARSAL_BEFORE_PREVIOUS_AT, durationMs: REHEARSAL_LONG_MS },
				{ startAt: REHEARSAL_AFTER_PREVIOUS_AT, durationMs: REHEARSAL_SHORT_MS },
				{ startAt: REHEARSAL_ENDING_AFTER_HR_AT, durationMs: REHEARSAL_SHORT_MS },
			],
		},
		expected: [
			landingFinding({
				severity: 'amber',
				handover: '6 m 40 s',
				detail: [HOOK_REUSED, `rehearsals before it: 10 m 0 s (${REHEARSAL_AFTER_PREVIOUS_AT})`],
			}),
		],
	},
	{
		name: 'two earlier handover runs, rehearsals between them and after the last → only the one after the last',
		lot: {
			handoverMs: OVER_BUDGET_MS,
			hooks: [REUSED],
			previousHandovers: [
				{ startAt: HR_EARLIEST_START_AT, durationMs: HR_PREVIOUS_MS },
				{ startAt: HR_PREVIOUS_START_AT, durationMs: HR_PREVIOUS_MS },
			],
			rehearsals: [
				{ startAt: REHEARSAL_BETWEEN_PREVIOUS_AT, durationMs: REHEARSAL_SHORT_MS },
				{ startAt: REHEARSAL_AFTER_PREVIOUS_AT, durationMs: REHEARSAL_SHORT_MS },
			],
		},
		expected: [
			landingFinding({
				severity: 'amber',
				handover: '6 m 40 s',
				detail: [HOOK_REUSED, `rehearsals before it: 10 m 0 s (${REHEARSAL_AFTER_PREVIOUS_AT})`],
			}),
		],
	},
	{
		name: 'rehearsals with no earlier handover run → all listed, in start order',
		lot: {
			handoverMs: OVER_BUDGET_MS,
			hooks: [REUSED],
			rehearsals: [
				{ startAt: REHEARSAL_AFTER_PREVIOUS_AT, durationMs: REHEARSAL_SHORT_MS },
				{ startAt: REHEARSAL_BEFORE_PREVIOUS_AT, durationMs: REHEARSAL_LONG_MS },
			],
		},
		expected: [
			landingFinding({
				severity: 'amber',
				handover: '6 m 40 s',
				detail: [
					HOOK_REUSED,
					`rehearsals before it: 20 m 0 s (${REHEARSAL_BEFORE_PREVIOUS_AT}), 10 m 0 s (${REHEARSAL_AFTER_PREVIOUS_AT})`,
				],
			}),
		],
	},
	{
		name: 'a run that started before the window and ended inside it → a finding at its start',
		lot: { handoverMs: OVER_BUDGET_MS, hrStartAt: HANDOVER_ENDS_AFTER_SINCE_AT, hooks: [RAN] },
		expected: [amberNotReused({ at: HANDOVER_ENDS_AFTER_SINCE_AT })],
	},
	{
		name: 'a run that started inside the window and ended after now → nothing',
		lot: { handoverMs: OVER_BUDGET_MS, hrStartAt: HANDOVER_ENDS_AFTER_NOW_AT, hooks: [RAN] },
		expected: [],
	},
	{
		name: 'two lots: the first listed has a later slow run and a hook inside the other one’s span → sorted by time, hooks never mixed',
		otherLots: [
			{
				name: EARLIER_LOT,
				handoverMs: OVER_BUDGET_MS,
				hrStartAt: LATER_HR_START_AT,
				hooks: [{ ...REUSED, startAt: EARLIER_LOT_HOOK_IN_MAIN_SPAN_AT }, REUSED],
			},
		],
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN] },
		expected: [
			amberNotReused(),
			landingFinding({
				severity: 'amber',
				handover: '6 m 40 s',
				detail: [HOOK_REUSED],
				at: LATER_HR_START_AT,
				lot: EARLIER_LOT,
			}),
		],
	},
]

describe('findSlowLandings, spans, order, duplicates, rehearsals and lots', () => {
	it.each(cases)('$name', (row) => {
		expect(findLandingsOfCase(row)).toEqual(row.expected)
	})
})
