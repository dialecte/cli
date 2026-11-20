import { judgeGrowth } from './judge-growth.ts'

import { describe, expect, it } from 'vitest'

import type { GrowthRow } from './judge-growth.types.ts'
import type { Counts, TreeCounts } from './measure-tree.types.ts'

const THRESHOLD = 0.05

function countsOf(instantiations: number): Counts {
	return { Instantiations: instantiations, Types: 10, Symbols: 5 }
}

function oneScenario(params: { version: string; scenario: string; count: number }): TreeCounts {
	return { [params.version]: { [params.scenario]: countsOf(params.count) } }
}

describe('judgeGrowth: each scenario of the head against the base', () => {
	const testCases: Record<string, { base: TreeCounts; head: TreeCounts; expected: GrowthRow[] }> = {
		'head at 105.0% of the base → within: exactly the threshold passes': {
			base: oneScenario({ version: 'v1', scenario: 'coverage: calls', count: 1000 }),
			head: oneScenario({ version: 'v1', scenario: 'coverage: calls', count: 1050 }),
			expected: [
				{ version: 'v1', scenario: 'coverage: calls', base: 1000, head: 1050, verdict: 'within' },
			],
		},
		'head at 105.1% of the base → over': {
			base: oneScenario({ version: 'v1', scenario: 'coverage: calls', count: 1000 }),
			head: oneScenario({ version: 'v1', scenario: 'coverage: calls', count: 1051 }),
			expected: [
				{ version: 'v1', scenario: 'coverage: calls', base: 1000, head: 1051, verdict: 'over' },
			],
		},
		'head at 95.0% of the base → within: exactly the threshold below passes': {
			base: oneScenario({ version: 'v1', scenario: 'coverage: calls', count: 1000 }),
			head: oneScenario({ version: 'v1', scenario: 'coverage: calls', count: 950 }),
			expected: [
				{ version: 'v1', scenario: 'coverage: calls', base: 1000, head: 950, verdict: 'within' },
			],
		},
		'head at 94% of the base → shrunk': {
			base: oneScenario({ version: 'v1', scenario: 'coverage: calls', count: 1000 }),
			head: oneScenario({ version: 'v1', scenario: 'coverage: calls', count: 940 }),
			expected: [
				{ version: 'v1', scenario: 'coverage: calls', base: 1000, head: 940, verdict: 'shrunk' },
			],
		},
		'a scenario at head only → new; one at base only → gone; neither gated': {
			base: { v1: { 'consumer: old': countsOf(400) } },
			head: { v1: { 'consumer: fresh': countsOf(900) } },
			expected: [
				{ version: 'v1', scenario: 'consumer: fresh', head: 900, verdict: 'new' },
				{ version: 'v1', scenario: 'consumer: old', base: 400, verdict: 'gone' },
			],
		},
		'a version at head only → each of its rows new': {
			base: oneScenario({ version: 'v1', scenario: 'coverage: calls', count: 1000 }),
			head: {
				v1: { 'coverage: calls': countsOf(1000) },
				v2: { 'coverage: calls': countsOf(300), 'coverage: surface': countsOf(200) },
			},
			expected: [
				{ version: 'v1', scenario: 'coverage: calls', base: 1000, head: 1000, verdict: 'within' },
				{ version: 'v2', scenario: 'coverage: calls', head: 300, verdict: 'new' },
				{ version: 'v2', scenario: 'coverage: surface', head: 200, verdict: 'new' },
			],
		},
		'a base of 0 and a head of 0 → within': {
			base: oneScenario({ version: 'v1', scenario: 'consumer: empty', count: 0 }),
			head: oneScenario({ version: 'v1', scenario: 'consumer: empty', count: 0 }),
			expected: [
				{ version: 'v1', scenario: 'consumer: empty', base: 0, head: 0, verdict: 'within' },
			],
		},
		'a base of 0 and a head above it → over': {
			base: oneScenario({ version: 'v1', scenario: 'consumer: empty', count: 0 }),
			head: oneScenario({ version: 'v1', scenario: 'consumer: empty', count: 1 }),
			expected: [{ version: 'v1', scenario: 'consumer: empty', base: 0, head: 1, verdict: 'over' }],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(
				[...judgeGrowth({ base: testCase.base, head: testCase.head, threshold: THRESHOLD })].sort(
					function byVersionThenScenario(first, second) {
						return `${first.version} ${first.scenario}`.localeCompare(
							`${second.version} ${second.scenario}`,
						)
					},
				),
			).toEqual(testCase.expected)
		})
})
