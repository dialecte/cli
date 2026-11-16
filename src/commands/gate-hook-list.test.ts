/** `dialecte.gate.hook`: a package that declares a hook list commits on it; without one the hook runs as before. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { runHookIn } from '../../test/gate-hook.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { countRuns, countingStep, createCounter } from '../../test/scratch-checks.ts'
import { createScratchRepository } from '../../test/scratch-repository.ts'
import { hashHookGateCommand } from '../lib/gate-records/check-key.ts'
import { hasScopedHookStep } from '../lib/gate/gate-base.ts'
import { GateConfigError, resolveHookSteps } from '../lib/gate/gate-config.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../lib/gate/gate-config.types.ts'
import type { PackageJson } from '../lib/package-json.types.ts'

const PACKAGE_ROOT = join(import.meta.dirname, '..', '..')

const CHECK: GateStep = { name: 'check', run: 'npm run check' }
const FULL_TESTS: GateStep = { name: 'tests', run: 'npx vitest run', counts: 'tests' }
const SCOPED_TESTS: GateStep = {
	name: 'tests',
	run: 'node scoped.ts',
	counts: 'tests',
	scoped: true,
}
const RULES: GateStep = { name: 'rules', run: 'dialecte rules', scoped: true }

/** A package.json whose gate declares `full`, and `hook` when given. */
function packageJsonOf(params: { full: GateStep[]; hook?: GateStep[] }): PackageJson {
	return {
		name: 'demo',
		scripts: { check: 'true' },
		dialecte: { gate: { full: params.full, ...(params.hook && { hook: params.hook }) } },
	} as PackageJson
}

describe('resolveHookSteps', () => {
	it.each([
		{
			label: 'no hook list → the full steps but the scoped ones counting no tests, as before',
			packageJson: packageJsonOf({
				full: [CHECK, FULL_TESTS, RULES, { ...SCOPED_TESTS, name: 'scoped tests' }],
			}),
			names: [
				['check', false],
				['tests', false],
				['scoped tests', true],
			],
		},
		{
			label: 'a declared hook list → its steps alone, in its order, whatever full holds',
			packageJson: packageJsonOf({ full: [CHECK, FULL_TESTS, RULES], hook: [CHECK, SCOPED_TESTS] }),
			names: [
				['check', false],
				['tests', true],
			],
		},
	])('$label', ({ packageJson, names }) => {
		expect(
			resolveHookSteps({ packageJson }).map((step) => [step.name, step.scoped === true]),
		).toEqual(names)
	})

	it('a hook list that is no list of steps → refused naming dialecte.gate.hook', () => {
		const packageJson = packageJsonOf({ full: [CHECK], hook: [{ name: 'check' } as GateStep] })

		expect(() => resolveHookSteps({ packageJson })).toThrow(GateConfigError)
		expect(() => resolveHookSteps({ packageJson })).toThrow(/dialecte\.gate\.hook/)
	})

	it('the hook-gate record key (hashHookGateCommand) → another hash once a hook list is declared', () => {
		const full = [CHECK, FULL_TESTS]

		expect(hashHookGateCommand({ packageJson: packageJsonOf({ full, hook: [CHECK] }) })).not.toBe(
			hashHookGateCommand({ packageJson: packageJsonOf({ full }) }),
		)
	})

	it('a declared hook list holding a scoped test step → the hook resolves a base (hasScopedHookStep)', () => {
		expect(
			hasScopedHookStep(packageJsonOf({ full: [CHECK, FULL_TESTS], hook: [CHECK, SCOPED_TESTS] })),
		).toBe(true)
	})

	it("the cli's own package.json → the hook runs check and the scoped rules, no test suite (CI runs it)", () => {
		const packageJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'))

		expect(
			resolveHookSteps({ packageJson }).map((step) => ({
				name: step.name,
				scoped: step.scoped === true,
			})),
		).toEqual([
			{ name: 'check', scoped: false },
			{ name: 'rules', scoped: true },
		])
	})
})

describe('gate --hook with a declared hook list', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('full holds a counting tests step, hook holds only a counting check → the commit runs the check alone', async () => {
		const checkCounter = createCounter()
		const testCounter = createCounter()
		const check = countingStep({ counter: checkCounter, name: 'check' })
		const tests = countingStep({ counter: testCounter, name: 'tests' })
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: 'demo', scripts: {}, dialecte: { gate: { full: [check, tests], hook: [check] } } })}\n`,
			'.gitignore': 'node_modules\n',
		})

		const result = await runHookIn({ cwd: root })

		expect(result.exitCode).toBe(0)
		expect([countRuns(checkCounter), countRuns(testCounter)]).toEqual([1, 0])
	})
})
