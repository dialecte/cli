/**
 * The gate this package runs on itself: its package.json declares `dialecte.gate`, read here through the gate's own
 * resolution (never restated): `fast` runs the check, the scoped tests and the rules; `full` runs today's defaults
 * and the rules.
 */
import { PACKAGE_ROOT } from '../../../test/step4-cases.constants.ts'
import { readPackageJson } from '../package-json.ts'
import { DEFAULT_GATE_STEPS } from './gate-config.constants.ts'
import { releaseCoversFull, resolveGateSteps, validateGateConfig } from './gate-config.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from './gate-config.types.ts'

const OWN_PACKAGE = readPackageJson(PACKAGE_ROOT)

function namesOf(steps: readonly GateStep[]): string[] {
	return steps.map((step) => step.name)
}

function stepNamed(params: { steps: readonly GateStep[]; name: string }): GateStep | undefined {
	return params.steps.find((step) => step.name === params.name)
}

describe('this package’s own gate (its package.json dialecte.gate)', () => {
	it('fast → check (the default one), tests, rules, in that order, from a valid config', () => {
		expect(() => validateGateConfig(OWN_PACKAGE)).not.toThrow()

		const steps = resolveGateSteps({ packageJson: OWN_PACKAGE, mode: 'fast' })

		expect(namesOf(steps)).toEqual(['check', 'tests', 'rules'])
		expect(stepNamed({ steps, name: 'check' })).toEqual(DEFAULT_GATE_STEPS.full[0])
	})

	it('fast, the tests step → scoped, counting tests, running the scoped tests entry, no changedOnly', () => {
		const steps = resolveGateSteps({ packageJson: OWN_PACKAGE, mode: 'fast' })

		expect(stepNamed({ steps, name: 'tests' })).toEqual({
			name: 'tests',
			run: expect.stringMatching(/scoped-tests/),
			counts: 'tests',
			scoped: true,
		})
	})

	it('fast, the rules step → scoped (it gets the changed list), running dialecte rules, counting nothing', () => {
		const steps = resolveGateSteps({ packageJson: OWN_PACKAGE, mode: 'fast' })

		expect(stepNamed({ steps, name: 'rules' })).toEqual({
			name: 'rules',
			run: expect.stringMatching(/\brules\b/),
			scoped: true,
		})
	})

	it('full → the default full steps unchanged but for their own rules step, then rules (scoped, as in fast); release is the same list and covers it', () => {
		const fast = resolveGateSteps({ packageJson: OWN_PACKAGE, mode: 'fast' })
		const rules = stepNamed({ steps: fast, name: 'rules' })
		const defaultsBeforeRules = DEFAULT_GATE_STEPS.full.filter((step) => step.name !== 'rules')
		const expectedFull = [...defaultsBeforeRules, rules]

		expect({
			full: resolveGateSteps({ packageJson: OWN_PACKAGE, mode: 'full' }),
			release: resolveGateSteps({ packageJson: OWN_PACKAGE, mode: 'release' }),
			covers: releaseCoversFull({ packageJson: OWN_PACKAGE }),
		}).toEqual({ full: expectedFull, release: expectedFull, covers: true })
	})
})
