/**
 * The heavy advice of the proposals (33N section 7, case 34): a proposal whose heavy steps meet a live one of the
 * same kind says `stacks`; a short machine says its heavy steps would wait. Advice only: it never holds a lot back.
 */
import { blockOf, factsOf, lotOf } from '../../../test/plan-state-facts.ts'
import { entryStates } from './entry-state.ts'
import { proposePlan } from './propose.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlanHeavyMarker, PlanHeavyReading } from './propose.types.ts'

beforeEach(function readLocalTimeAsUtc() {
	vi.stubEnv('TZ', 'UTC')
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Four candidates meeting nothing: no extra heavy step, mutation, browser, release. */
const LOTS = [
	lotOf('H0'),
	lotOf('Hm', { heavy: ['mutation'] }),
	lotOf('Hb', { heavy: ['browser'] }),
	lotOf('Hr', { heavy: ['release'] }),
]

function markerOf(step: string, since: string, worktree = '0016-cli-a'): PlanHeavyMarker {
	return { step, worktree, since: `2026-11-10T${since}:00.000Z`, entry: null }
}

/** What each candidate says of its stacking and what is proposed, for a reading. */
function adviceOf(heavy: PlanHeavyReading): {
	start: string[]
	stacks: Record<string, string[]>
	wait: Record<string, string | undefined>
} {
	const block = blockOf({ lots: LOTS })
	const facts = factsOf({})
	const proposed = proposePlan({ block, facts, states: entryStates({ block, facts }), heavy })
	return {
		start: proposed.proposals.map((proposal) => proposal.id),
		stacks: Object.fromEntries(
			proposed.proposals.map((proposal) => [proposal.id, proposal.stacks]),
		),
		wait: Object.fromEntries(proposed.proposals.map((proposal) => [proposal.id, proposal.wait])),
	}
}

/** The stacks every candidate shows for the same text. */
function allStack(...texts: string[]): Record<string, string[]> {
	return { H0: texts, Hm: texts, Hb: texts, Hr: texts }
}

type StackRow = { name: string; markers: PlanHeavyMarker[]; stacks: Record<string, string[]> }

const STACK_ROWS: StackRow[] = [
	{
		name: 'a live mutation stacks with a lot declaring mutation only (case 34)',
		markers: [markerOf('mutation', '10:02')],
		stacks: {
			H0: [],
			Hm: ['mutation (running in 0016-cli-a since 10:02)'],
			Hb: [],
			Hr: [],
		},
	},
	{
		name: 'a live gate --full stacks with every lot: each makes a whole-suite run',
		markers: [markerOf('gate-full', '10:02')],
		stacks: allStack('gate --full (running in 0016-cli-a since 10:02)'),
	},
	{
		name: 'a live gate --release stacks with every lot once, the release lot too',
		markers: [markerOf('gate-release', '10:02')],
		stacks: allStack('gate --release (running in 0016-cli-a since 10:02)'),
	},
	{
		name: 'contrib and rehearsal stack with every lot, in the order they started',
		markers: [markerOf('contrib', '10:01'), markerOf('rehearsal', '10:03', '0017-cli-b')],
		stacks: allStack(
			'contrib (running in 0016-cli-a since 10:01)',
			'rehearsal (running in 0017-cli-b since 10:03)',
		),
	},
	{
		name: 'handover run is no whole-suite run of the list: it stacks with nothing; mutation still does',
		markers: [markerOf('handover-run', '10:01'), markerOf('mutation', '10:02')],
		stacks: {
			H0: [],
			Hm: ['mutation (running in 0016-cli-a since 10:02)'],
			Hb: [],
			Hr: [],
		},
	},
	{
		name: 'a heavy part of gate --fast stacks with a lot declaring browser only',
		markers: [markerOf('gate-fast: e2e', '10:02')],
		stacks: {
			H0: [],
			Hm: [],
			Hb: ['gate-fast: e2e (running in 0016-cli-a since 10:02)'],
			Hr: [],
		},
	},
	{
		name: 'a heavy part of gate --hook stacks with a lot declaring browser only',
		markers: [markerOf('gate-hook: e2e', '10:02')],
		stacks: {
			H0: [],
			Hm: [],
			Hb: ['gate-hook: e2e (running in 0016-cli-a since 10:02)'],
			Hr: [],
		},
	},
	{
		name: 'two mutation runs in two worktrees: both named, in the order they started',
		markers: [markerOf('mutation', '10:02'), markerOf('mutation', '10:04', '0017-cli-b')],
		stacks: {
			H0: [],
			Hm: [
				'mutation (running in 0016-cli-a since 10:02)',
				'mutation (running in 0017-cli-b since 10:04)',
			],
			Hb: [],
			Hr: [],
		},
	},
	{
		name: 'the start is the clock time of the marker, with its zero',
		markers: [markerOf('mutation', '09:05')],
		stacks: {
			H0: [],
			Hm: ['mutation (running in 0016-cli-a since 09:05)'],
			Hb: [],
			Hr: [],
		},
	},
	{
		name: 'a mix: each lot shows the markers of its own kinds, in start order',
		markers: [
			markerOf('gate-full', '10:00'),
			markerOf('mutation', '10:01'),
			markerOf('gate-fast: e2e', '10:02'),
		],
		stacks: {
			H0: ['gate --full (running in 0016-cli-a since 10:00)'],
			Hm: [
				'gate --full (running in 0016-cli-a since 10:00)',
				'mutation (running in 0016-cli-a since 10:01)',
			],
			Hb: [
				'gate --full (running in 0016-cli-a since 10:00)',
				'gate-fast: e2e (running in 0016-cli-a since 10:02)',
			],
			Hr: ['gate --full (running in 0016-cli-a since 10:00)'],
		},
	},
]

describe('proposePlan: stacks, advice only', () => {
	it.each(STACK_ROWS)('$name', ({ markers, stacks }) => {
		expect(adviceOf({ markers })).toEqual({
			start: ['H0', 'Hm', 'Hb', 'Hr'],
			stacks,
			wait: { H0: undefined, Hm: undefined, Hb: undefined, Hr: undefined },
		})
	})
})

describe('proposePlan: the start time is local time', () => {
	it('under Asia/Kolkata (UTC+5:30) a start of 10:02Z reads 15:32', () => {
		vi.stubEnv('TZ', 'Asia/Kolkata')

		expect(adviceOf({ markers: [markerOf('mutation', '10:02')] }).stacks.Hm).toEqual([
			'mutation (running in 0016-cli-a since 15:32)',
		])
	})
})

describe('proposePlan: a short machine says its heavy steps would wait', () => {
	it('every proposal says so, still proposed; no reason, no saying', () => {
		const short = adviceOf({
			markers: [],
			shortReasons: ['load 31.2 > 24', 'memory 1.6 GB < 2 GB'],
		})
		const quiet = adviceOf({ markers: [], shortReasons: [] })

		expect({ short: short.wait, start: short.start, quiet: quiet.wait }).toEqual({
			short: Object.fromEntries(
				['H0', 'Hm', 'Hb', 'Hr'].map((id) => [
					id,
					'the machine is short now (load 31.2 > 24; memory 1.6 GB < 2 GB): its heavy steps would wait (section 8)',
				]),
			),
			start: ['H0', 'Hm', 'Hb', 'Hr'],
			quiet: { H0: undefined, Hm: undefined, Hb: undefined, Hr: undefined },
		})
	})

	it('short on the load alone (memory unknown): the one reason is said', () => {
		expect(adviceOf({ markers: [], shortReasons: ['load 31.2 > 24'] }).wait.H0).toBe(
			'the machine is short now (load 31.2 > 24): its heavy steps would wait (section 8)',
		)
	})

	it('a stacking proposal on a short machine says both, never held (advice only)', () => {
		const advice = adviceOf({
			markers: [markerOf('mutation', '10:02')],
			shortReasons: ['load 31.2 > 24'],
		})

		expect({ start: advice.start, hm: advice.stacks.Hm, wait: advice.wait.Hm }).toEqual({
			start: ['H0', 'Hm', 'Hb', 'Hr'],
			hm: ['mutation (running in 0016-cli-a since 10:02)'],
			wait: 'the machine is short now (load 31.2 > 24): its heavy steps would wait (section 8)',
		})
	})
})
