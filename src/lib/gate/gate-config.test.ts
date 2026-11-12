import { DEFAULT_GATE_STEPS } from './gate-config.constants.ts'
import {
	GateConfigError,
	releaseCoversFull,
	resolveGateSteps,
	validateGateConfig,
} from './gate-config.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'

const TYPE_NARROWING_RUN = 'npm run type-narrowing'
const NARROWING_SCRIPTS = { 'type-narrowing': 'tsc -p tsconfig.narrowing.json' }

/** A package.json whose `dialecte.gate` is `gate`, as a hand-edited file may hold it (any shape). */
function gatePackage(gate: unknown): PackageJson {
	return { dialecte: { gate } } as PackageJson
}

const WIRED_DOCS_SCRIPTS = { 'doc:build': 'node docs.js' }

/** Steps as a package.json writes them: the marks the resolution adds (default, opted out, unwired) left off. */
function withoutMarks(steps: readonly GateStep[]): GateStep[] {
	return steps.map(
		({ isDefault: _isDefault, optedOut: _optedOut, unwired: _unwired, ...rest }) => rest,
	)
}

const CHECK_STEP = { name: 'check', run: 'npm run check' }
const TESTS_STEP = { name: 'tests', run: 'npx vitest run', counts: 'tests' as const }
const BUILD_STEP = { name: 'build', run: 'npm run build' }

describe('validateGateConfig', () => {
	it.each([
		{
			label: 'a non-boolean scoped',
			gate: { full: [{ ...CHECK_STEP, scoped: 'yes' }] },
			message: /full.*check|check.*full/s,
		},
		{
			label: 'a non-boolean heavy',
			gate: { fast: [{ ...CHECK_STEP }, { ...BUILD_STEP, heavy: 1 }] },
			message: /fast.*build|build.*fast/s,
		},
		{
			label: 'scoped together with changedOnly on one step',
			gate: { fast: [{ ...TESTS_STEP, scoped: true, changedOnly: true }] },
			message: /fast.*tests|tests.*fast/s,
		},
		{
			label: 'a release that is no list',
			gate: { release: { name: 'tests', run: 'npx vitest run' } },
			message: /release/,
		},
		{
			label: 'a release step without a name',
			gate: { release: [{ run: 'npm run check' }] },
			message: /release.*(npm run check|\b0\b)/s,
		},
		{
			label: 'a full step without a run',
			gate: { full: [{ name: 'check' }] },
			message: /full.*check|check.*full/s,
		},
		{
			label: 'a fast step without a run',
			gate: { fast: [CHECK_STEP, { name: 'tests' }] },
			message: /fast.*tests|tests.*fast/s,
		},
		{
			label: 'a release step without a run',
			gate: { release: [CHECK_STEP, { name: 'build' }] },
			message: /release.*build|build.*release/s,
		},
	])('$label → a GateConfigError naming the list and the step', ({ gate, message }) => {
		expect(() => validateGateConfig(gatePackage(gate))).toThrow(GateConfigError)
		expect(() => validateGateConfig(gatePackage(gate))).toThrow(message)
	})

	it('a config holding scoped, heavy and release → valid, nothing thrown', () => {
		const gate = {
			fast: [CHECK_STEP, { ...TESTS_STEP, scoped: true }],
			full: [CHECK_STEP, { ...BUILD_STEP, heavy: true }, { ...TESTS_STEP, scoped: true }],
			release: [CHECK_STEP, { ...BUILD_STEP, heavy: true }, { ...TESTS_STEP, scoped: true }],
		}

		expect(() => validateGateConfig(gatePackage(gate))).not.toThrow()
	})

	it('a step with scoped: false and changedOnly: true → valid, nothing thrown', () => {
		const gate = { fast: [{ ...TESTS_STEP, scoped: false, changedOnly: true }] }

		expect(() => validateGateConfig(gatePackage(gate))).not.toThrow()
	})

	it('no dialecte.gate at all → valid, nothing thrown', () => {
		expect(() => validateGateConfig({})).not.toThrow()
	})
})

describe('resolveGateSteps validation', () => {
	it.each(['fast', 'full', 'release'] as const)(
		'an invalid %s list → a GateConfigError, resolved never silently',
		(mode) => {
			const packageJson = gatePackage({ [mode]: [{ ...CHECK_STEP, scoped: 'yes' }] })

			expect(() => resolveGateSteps({ packageJson, mode })).toThrow(GateConfigError)
		},
	)

	it('a release that is no list, resolved in release mode → a GateConfigError naming release', () => {
		const packageJson = gatePackage({ release: { name: 'tests', run: 'npx vitest run' } })

		expect(() => resolveGateSteps({ packageJson, mode: 'release' })).toThrow(GateConfigError)
		expect(() => resolveGateSteps({ packageJson, mode: 'release' })).toThrow(/release/)
	})

	it('a release step without a run, resolved in full mode → a GateConfigError (every list is validated)', () => {
		const packageJson = gatePackage({ release: [{ name: 'check' }] })

		expect(() => resolveGateSteps({ packageJson, mode: 'full' })).toThrow(GateConfigError)
	})
})

describe('resolveGateSteps release', () => {
	it('a declared dialecte.gate.release, the package having a type-narrowing script → returned as is, no derived step added', () => {
		const release = [CHECK_STEP, { ...TESTS_STEP, scoped: true }]

		expect(
			resolveGateSteps({
				packageJson: {
					scripts: { ...NARROWING_SCRIPTS, check: 'tsc' },
					dialecte: { gate: { release } },
				},
				mode: 'release',
			}),
		).toEqual(release)
	})

	it('no dialecte.gate.release → the resolved full steps, derived ones included', () => {
		const full = [TESTS_STEP, { name: 'docs', run: 'npm run doc:build' }]
		const packageJson = { scripts: NARROWING_SCRIPTS, dialecte: { gate: { full } } }

		expect(resolveGateSteps({ packageJson, mode: 'release' })).toEqual(
			resolveGateSteps({ packageJson, mode: 'full' }),
		)
		expect(resolveGateSteps({ packageJson, mode: 'release' }).map((step) => step.run)).toEqual([
			'npx vitest run',
			'npm run doc:build',
			TYPE_NARROWING_RUN,
		])
	})

	it('no dialecte.gate at all → release is the default full steps', () => {
		expect(withoutMarks(resolveGateSteps({ packageJson: {}, mode: 'release' }))).toEqual(
			DEFAULT_GATE_STEPS.full,
		)
	})
})

describe('releaseCoversFull', () => {
	const FULL = [CHECK_STEP, TESTS_STEP]

	it.each([
		{
			label: 'no release declared (the default release is full)',
			packageJson: gatePackage({ full: FULL }),
			covers: true,
		},
		{
			label: 'no dialecte.gate at all',
			packageJson: {},
			covers: true,
		},
		{
			label: 'a release equal to full',
			packageJson: gatePackage({ full: FULL, release: FULL }),
			covers: true,
		},
		{
			label: 'a release adding a step full lacks',
			packageJson: gatePackage({ full: FULL, release: [...FULL, BUILD_STEP] }),
			covers: true,
		},
		{
			label: 'a release whose step differs from full by scoped only',
			packageJson: gatePackage({
				full: FULL,
				release: [CHECK_STEP, { ...TESTS_STEP, scoped: true }],
			}),
			covers: true,
		},
		{
			label: 'a release holding the full steps in another order',
			packageJson: gatePackage({ full: FULL, release: [TESTS_STEP, CHECK_STEP] }),
			covers: true,
		},
		{
			label: 'a release with a step put before the full steps',
			packageJson: gatePackage({ full: FULL, release: [BUILD_STEP, ...FULL] }),
			covers: true,
		},
		{
			label: 'a release step with counts where full has none',
			packageJson: gatePackage({
				full: FULL,
				release: [{ ...CHECK_STEP, counts: 'tests' as const }, TESTS_STEP],
			}),
			covers: false,
		},
		{
			label: 'a full step with changedOnly where the release has none',
			packageJson: gatePackage({
				full: [CHECK_STEP, { ...TESTS_STEP, changedOnly: true }],
				release: FULL,
			}),
			covers: false,
		},
		{
			label: 'a release missing a full step',
			packageJson: gatePackage({ full: FULL, release: [TESTS_STEP] }),
			covers: false,
		},
		{
			label: 'a release step with another run',
			packageJson: gatePackage({
				full: FULL,
				release: [CHECK_STEP, { ...TESTS_STEP, run: 'npx vitest run --changed' }],
			}),
			covers: false,
		},
		{
			label: 'a release tests step lacking counts: tests',
			packageJson: gatePackage({
				full: FULL,
				release: [CHECK_STEP, { name: 'tests', run: 'npx vitest run' }],
			}),
			covers: false,
		},
		{
			label: 'a release step with changedOnly where full has none',
			packageJson: gatePackage({
				full: FULL,
				release: [CHECK_STEP, { ...TESTS_STEP, changedOnly: true }],
			}),
			covers: false,
		},
		{
			label:
				'a declared release missing the derived type-narrowing step the package has the script for',
			packageJson: {
				scripts: NARROWING_SCRIPTS,
				dialecte: { gate: { full: FULL, release: FULL } },
			} as PackageJson,
			covers: false,
		},
		{
			label: 'a declared release holding the derived type-narrowing step',
			packageJson: {
				scripts: NARROWING_SCRIPTS,
				dialecte: {
					gate: {
						full: FULL,
						release: [...FULL, { name: 'type-narrowing', run: TYPE_NARROWING_RUN }],
					},
				},
			} as PackageJson,
			covers: true,
		},
	])('$label → covers: $covers', ({ packageJson, covers }) => {
		expect(releaseCoversFull({ packageJson })).toBe(covers)
	})
})

describe('resolveGateSteps', () => {
	it('full without dialecte.gate → check, skills, build, tests (no docs, no type-bench)', () => {
		const steps = resolveGateSteps({ packageJson: {}, mode: 'full' })

		expect(withoutMarks(steps)).toEqual(DEFAULT_GATE_STEPS.full)
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
			resolveGateSteps({
				packageJson: { scripts: WIRED_DOCS_SCRIPTS, dialecte: { gate: { full } } },
				mode: 'full',
			}),
		).toEqual(full)
	})

	it('steps declared for one mode → they replace that mode only', () => {
		const fast = [{ name: 'tests', run: 'npx vitest run --project unit --changed' }]

		expect(
			resolveGateSteps({ packageJson: { dialecte: { gate: { fast } } }, mode: 'fast' }),
		).toEqual(fast)
		expect(
			withoutMarks(
				resolveGateSteps({ packageJson: { dialecte: { gate: { fast } } }, mode: 'full' }),
			),
		).toEqual(DEFAULT_GATE_STEPS.full)
	})

	it('full of a package with a type-narrowing script, declared or default steps → those steps untouched, in order, then a type-narrowing step', () => {
		const full = [
			{ name: 'tests', run: 'npx vitest run', counts: 'tests' as const },
			{ name: 'docs', run: 'npm run doc:build', restoresGeneratedDocs: true },
		]

		const declared = resolveGateSteps({
			packageJson: {
				scripts: { ...NARROWING_SCRIPTS, ...WIRED_DOCS_SCRIPTS },
				dialecte: { gate: { full } },
			},
			mode: 'full',
		})
		const defaults = resolveGateSteps({
			packageJson: { scripts: NARROWING_SCRIPTS },
			mode: 'full',
		})

		expect(declared.slice(0, full.length)).toEqual(full)
		expect(declared.slice(full.length)).toMatchObject([
			{ name: 'type-narrowing', run: TYPE_NARROWING_RUN },
		])
		expect(withoutMarks(defaults.slice(0, DEFAULT_GATE_STEPS.full.length))).toEqual(
			DEFAULT_GATE_STEPS.full,
		)
		expect(defaults.slice(DEFAULT_GATE_STEPS.full.length)).toMatchObject([
			{ name: 'type-narrowing', run: TYPE_NARROWING_RUN },
		])
	})

	it('a declared dialecte.gate.full already running npm run type-narrowing, a package with the script → that step once, none added', () => {
		const full = [
			{ name: 'tests', run: 'npx vitest run', counts: 'tests' as const },
			{ name: 'narrowing', run: TYPE_NARROWING_RUN },
		]

		const steps = resolveGateSteps({
			packageJson: { scripts: NARROWING_SCRIPTS, dialecte: { gate: { full } } },
			mode: 'full',
		})
		const other = resolveGateSteps({
			packageJson: {
				scripts: NARROWING_SCRIPTS,
				dialecte: { gate: { full: full.slice(0, 1) } },
			},
			mode: 'full',
		})

		expect(steps.filter((step) => step.run === TYPE_NARROWING_RUN)).toHaveLength(1)
		expect(other.filter((step) => step.run === TYPE_NARROWING_RUN)).toHaveLength(1)
	})

	it('fast, declared or default, a package with the script → no type-narrowing step, full beside it has one', () => {
		const declared = {
			scripts: NARROWING_SCRIPTS,
			dialecte: { gate: { fast: [{ name: 'tests', run: 'npx vitest run' }] } },
		}

		const fastRuns = [
			...resolveGateSteps({ packageJson: { scripts: NARROWING_SCRIPTS }, mode: 'fast' }),
			...resolveGateSteps({ packageJson: declared, mode: 'fast' }),
		].map((step) => step.run)
		const fullRuns = resolveGateSteps({ packageJson: declared, mode: 'full' }).map(
			(step) => step.run,
		)

		expect(fastRuns.filter((run) => run === TYPE_NARROWING_RUN)).toEqual([])
		expect(fullRuns.filter((run) => run === TYPE_NARROWING_RUN)).toEqual([TYPE_NARROWING_RUN])
	})
})
