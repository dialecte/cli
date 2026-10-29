import { DEFAULT_GATE_STEPS } from './gate-config.constants.ts'
import { resolveGateSteps } from './gate-config.ts'
import { isHeavyStep } from './run-gate.ts'

import { describe, expect, it } from 'vitest'

describe('resolveGateSteps', () => {
	it('no dialecte.gate → the default steps of the mode', () => {
		expect(resolveGateSteps({ packageJson: {}, mode: 'full' })).toEqual(DEFAULT_GATE_STEPS.full)
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

describe('isHeavyStep', () => {
	it('a browser project, vitest browser mode or playwright → heavy; a type-check → not; a declared value wins', () => {
		expect(
			[
				{ name: 'tests', run: 'npx vitest run --project browser' },
				{ name: 'tests', run: 'npx vitest run --browser.headless' },
				{ name: 'e2e', run: 'npx playwright test' },
				{ name: 'check', run: 'npm run check' },
				{ name: 'tests', run: 'npx vitest run --changed', heavy: true },
				{ name: 'e2e', run: 'npx playwright test', heavy: false },
			].map((step) => isHeavyStep({ step, browserTests: false })),
		).toEqual([true, true, true, false, true, false])
	})
})
