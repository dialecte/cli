import { DEFAULT_GATE_STEPS } from './gate-config.constants.ts'
import { resolveGateSteps } from './gate-config.ts'

import { describe, expect, it } from 'vitest'

const TYPE_NARROWING_RUN = 'npm run type-narrowing'
const NARROWING_SCRIPTS = { 'type-narrowing': 'tsc -p tsconfig.narrowing.json' }

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

	it('full of a package with a type-narrowing script, declared or default steps → those steps untouched, in order, then a type-narrowing step', () => {
		const full = [
			{ name: 'tests', run: 'npx vitest run', counts: 'tests' as const },
			{ name: 'docs', run: 'npm run doc:build', restoresGeneratedDocs: true },
		]

		const declared = resolveGateSteps({
			packageJson: { scripts: NARROWING_SCRIPTS, dialecte: { gate: { full } } },
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
		expect(defaults.slice(0, DEFAULT_GATE_STEPS.full.length)).toEqual(DEFAULT_GATE_STEPS.full)
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
