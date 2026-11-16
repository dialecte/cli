import {
	FIRST_HOOK,
	GREEN_AFTER_HOOK_AT,
	GREEN_BEFORE_HOOK_AT,
	HANDOVER_BEFORE_WINDOW_AT,
	HOOK_RAN_MS,
	OVER_BUDGET_MS,
	REAL_LANDING_AT,
	SECOND_HOOK,
} from '../../../test/health-landing.constants.ts'
import { amberNotReused, findLandingsOfCase, landingFinding } from '../../../test/health-landing.ts'
import { FIXTURE_0105, OTHER_TREE, TREE_PREFIX, WINDOW } from '../../../test/health.constants.ts'
import { copyHealthFixture, keyOf, recordOf } from '../../../test/health.ts'
import { LANDING_BUDGET_MS } from './health.constants.ts'
import { readHealthRepository } from './read-health-context.ts'
import { findDuplicateWork } from './rule-duplicate-work.ts'
import { findSlowLandings } from './rule-landing-time.ts'

import { describe, expect, it } from 'vitest'

import type { LandingCase } from '../../../test/health-landing.types.ts'

const KEY = keyOf()
const RAN = { durationMs: HOOK_RAN_MS }
const RAN_KEYED = { durationMs: HOOK_RAN_MS, key: KEY }
const REUSED = { durationMs: 24, reuse: 'whole' } as const
const NO_GREEN = `guards 20 s · lot ${FIRST_HOOK} hook ran 5 m 0 s - no green record of tree ${TREE_PREFIX}`
const HOOK_REUSED = `guards 20 s · lot ${FIRST_HOOK} hook reused`

const cases: LandingCase[] = [
	{
		name: 'over budget, a hook ran on a tree with no green record → amber, no green record of its tree',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN_KEYED] },
		expected: [landingFinding({ severity: 'amber', handover: '6 m 40 s', detail: [NO_GREEN] })],
	},
	{
		name: 'a green record of its tree older than the hook, key on the end → amber, not reused',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN_KEYED] },
		records: [recordOf({ mode: 'hook', at: GREEN_BEFORE_HOOK_AT })],
		expected: [amberNotReused()],
	},
	{
		name: 'the only green record of its tree is a failed one → no green record',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN_KEYED] },
		records: [
			{
				...recordOf({ mode: 'hook', at: GREEN_BEFORE_HOOK_AT }),
				steps: [{ name: 'check', status: 'failed', counts: {} }],
			},
		],
		expected: [landingFinding({ severity: 'amber', handover: '6 m 40 s', detail: [NO_GREEN] })],
	},
	{
		name: 'the green record of its tree is dated after the hook started → no green record',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN_KEYED] },
		records: [recordOf({ mode: 'hook', at: GREEN_AFTER_HOOK_AT })],
		expected: [landingFinding({ severity: 'amber', handover: '6 m 40 s', detail: [NO_GREEN] })],
	},
	{
		name: 'a green record older than the hook but of another tree → no green record of its tree',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN_KEYED] },
		records: [
			recordOf({ mode: 'hook', at: GREEN_BEFORE_HOOK_AT, key: keyOf({ tree: OTHER_TREE }) }),
		],
		expected: [landingFinding({ severity: 'amber', handover: '6 m 40 s', detail: [NO_GREEN] })],
	},
	{
		name: 'a hook interrupted → amber, interrupted',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [{ ...RAN_KEYED, outcome: 'interrupted' }] },
		expected: [
			landingFinding({
				severity: 'amber',
				handover: '6 m 40 s',
				detail: [`guards 20 s · lot ${FIRST_HOOK} hook ran 5 m 0 s - interrupted`],
			}),
		],
	},
	{
		name: 'a hook with a start and no end → ran for an unknown time, interrupted',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [{ ...RAN, noEnd: true }] },
		expected: [
			landingFinding({
				severity: 'amber',
				handover: '6 m 40 s',
				detail: [`guards 20 s · lot ${FIRST_HOOK} hook ran for an unknown time - interrupted`],
			}),
		],
	},
	{
		name: 'a hook end with no key and no duplicate → amber, not reused',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [RAN] },
		expected: [amberNotReused()],
	},
	{
		name: 'every hook reused, guards slow, over budget → amber, the guards carry the time',
		lot: { handoverMs: OVER_BUDGET_MS, guardsMs: 390_000, hooks: [REUSED] },
		expected: [
			landingFinding({
				severity: 'amber',
				handover: '6 m 40 s',
				detail: [`guards 6 m 30 s · lot ${FIRST_HOOK} hook reused`],
			}),
		],
	},
	{
		name: 'no hook at all, over budget → amber, the guards are the whole run, no trailing separator',
		lot: { handoverMs: OVER_BUDGET_MS, hooks: [] },
		expected: [
			landingFinding({ severity: 'amber', handover: '6 m 40 s', detail: ['guards 6 m 40 s'] }),
		],
	},
	{
		name: 'a handover run of 299999 ms → nothing',
		lot: { handoverMs: LANDING_BUDGET_MS - 1, hooks: [REUSED] },
		expected: [],
	},
	{
		name: 'a handover run of exactly the budget → a finding',
		lot: { handoverMs: LANDING_BUDGET_MS, hooks: [REUSED] },
		expected: [landingFinding({ severity: 'amber', handover: '5 m 0 s', detail: [HOOK_REUSED] })],
	},
	{
		name: 'a handover run that ended before the window → nothing',
		lot: { handoverMs: OVER_BUDGET_MS, hrStartAt: HANDOVER_BEFORE_WINDOW_AT, hooks: [RAN] },
		expected: [],
	},
	{
		name: 'a handover run with a start and no end → nothing',
		lot: { handoverMs: OVER_BUDGET_MS, noHandoverEnd: true, hooks: [RAN] },
		expected: [],
	},
]

describe('findSlowLandings, one lot', () => {
	it.each(cases)('$name', (row) => {
		expect(findLandingsOfCase(row)).toEqual(row.expected)
	})
})

describe('findSlowLandings, real records of a rehearsed lot', () => {
	it('the real handover run of 16 m 39 s → one red finding: guards, a reused hook, a duplicate hook, the rehearsals', () => {
		const repository = readHealthRepository({ common: copyHealthFixture({ name: FIXTURE_0105 }) })
		const duplicates = findDuplicateWork({ repository, window: WINDOW })

		expect(findSlowLandings({ repository, window: WINDOW, duplicates })).toEqual([
			{
				rule: 'landing-time',
				severity: 'red',
				repository: 'cli',
				lot: '0105-cli-lot-scope',
				at: REAL_LANDING_AT,
				text: `handover run 16 m 39 s (budget 5 m 0 s) at ${REAL_LANDING_AT}`,
				detail: [
					`guards 24 s · lot ${FIRST_HOOK} hook reused · lot ${SECOND_HOOK} hook ran 15 m 42 s - duplicate (see duplicate work)`,
					'rehearsals before it: 44 m 3 s (2026-11-15T02:50:15.369Z), 30 m 24 s (2026-11-15T03:38:50.904Z)',
				],
			},
		])
	})
})
