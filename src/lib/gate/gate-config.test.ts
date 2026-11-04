import { DEFAULT_GATE_STEPS } from './gate-config.constants.ts'
import { resolveGateSteps } from './gate-config.ts'

import { describe, expect, it } from 'vitest'

describe('resolveGateSteps', () => {
	it('full without dialecte.gate → check, skills, build, tests (no docs, no type-bench)', () => {
		const steps = resolveGateSteps({ packageJson: {}, mode: 'full' })

		expect(steps).toEqual(DEFAULT_GATE_STEPS.full)
		expect(steps.map((step) => step.run)).toEqual([
			'npm run check',
			'npm run skills:check',
			'npm run build',
			'npx vitest run',
		])
	})

	it('fast without dialecte.gate → unchanged', () => {
		expect(resolveGateSteps({ packageJson: {}, mode: 'fast' }).map((step) => step.run)).toEqual([
			'npm run check',
			'npm run skills:check',
			'npx vitest run --changed',
		])
	})

	it('a declared dialecte.gate.full holding docs → the declared steps, untouched', () => {
		const full = [
			{ name: 'tests', run: 'npx vitest run', counts: 'tests' as const },
			{ name: 'docs', run: 'npm run doc:build', restoresGeneratedDocs: true },
		]

		expect(
			resolveGateSteps({ packageJson: { dialecte: { gate: { full } } }, mode: 'full' }),
		).toEqual(full)
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
