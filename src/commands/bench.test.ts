import {
	aggregateRuns,
	checkRegression,
	parseTscMetrics,
	STABLE_METRICS,
	stableResults,
} from './bench.ts'

import { describe, expect, it } from 'vitest'

const SAMPLE = `
Files:              120
Instantiations:  115109
Types:            99123
Symbols:         327797
Memory used:   338523K
Check time:       1.02s
Total time:       1.32s
`

describe('parseTscMetrics', () => {
	it('extracts every tracked metric from a --extendedDiagnostics dump', () => {
		const m = parseTscMetrics(SAMPLE)
		expect(m.Instantiations).toBe(115109)
		expect(m.Types).toBe(99123)
		expect(m.Symbols).toBe(327797)
		expect(m['Check time']).toBe(1.02)
	})
	it('omits metrics absent from the output', () => {
		const m = parseTscMetrics('Instantiations: 10\n')
		expect(m.Instantiations).toBe(10)
		expect(m.Types).toBeUndefined()
	})
})

describe('aggregateRuns', () => {
	it('keeps the minimum value per metric across runs', () => {
		const m = aggregateRuns([
			{ Instantiations: 1000 },
			{ Instantiations: 800 },
			{ Instantiations: 900 },
		])
		expect(m.Instantiations).toBe(800)
	})
})

describe('checkRegression', () => {
	it('passes at exactly the threshold and fails just beyond it', () => {
		expect(checkRegression(1050, 1000, 0.05)).toBe(false)
		expect(checkRegression(1051, 1000, 0.05)).toBe(true)
	})
	it('never reports a regression when a value is missing', () => {
		expect(checkRegression(undefined, 1000)).toBe(false)
		expect(checkRegression(1000, undefined)).toBe(false)
	})
})

describe('stableResults', () => {
	it('persists only the deterministic metrics (drops timing + memory)', () => {
		const stable = stableResults({
			s: { Instantiations: 1, Types: 2, Symbols: 3, 'Check time': 9, 'Memory used': 9 },
		})
		expect(Object.keys(stable.s)).toEqual([...STABLE_METRICS])
		expect(stable.s['Check time']).toBeUndefined()
		expect(stable.s['Memory used']).toBeUndefined()
	})
})
