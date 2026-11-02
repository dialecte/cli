import { DEFAULT_GATE_STEPS } from './gate-config.constants.ts'
import { resolveGateSteps } from './gate-config.ts'

import { describe, expect, it } from 'vitest'

describe('resolveGateSteps', () => {
	it('no dialecte.gate → the default steps of the mode', () => {
		expect(resolveGateSteps({ packageJson: {}, mode: 'full' })).toEqual(DEFAULT_GATE_STEPS.full)
		expect(resolveGateSteps({ packageJson: {}, mode: 'full' }).map((step) => step.run)).toEqual([
			'npm run check',
			'npm run skills:check',
			'npm run build',
			'npx vitest run',
			'npm run doc:build',
			'npm run type-bench:check',
		])
		expect(resolveGateSteps({ packageJson: {}, mode: 'fast' }).map((step) => step.run)).toEqual([
			'npm run check',
			'npm run skills:check',
			'npx vitest run --changed',
		])
	})

	it('steps declared for one mode → they replace that mode only', () => {
		const fast = [{ name: 'tests', run: 'npx vitest run --project unit --changed' }]

		expect(
			resolveGateSteps({ packageJson: { dialecte: { gate: { fast } } }, mode: 'fast' }),
		).toEqual(fast)
		expect(
			resolveGateSteps({ packageJson: { dialecte: { gate: { fast } } }, mode: 'full' }),
		).toEqual(DEFAULT_GATE_STEPS.full)
	})
})
