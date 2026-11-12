import { GateConfigError } from '../gate/gate-config.ts'
import { resolveContribSteps } from './contrib-steps.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../package-json.types.ts'

const RULES_ROW = { name: 'rules', builtin: 'rules' }
const RELEASE_ROW = { name: 'release', builtin: 'release' }
const DOCS_STEP = { name: 'docs', run: 'npm run doc:build', restoresGeneratedDocs: true }
const TYPE_BENCH_STEP = { name: 'type-bench', run: 'npm run type-bench:check' }
const TYPE_NARROWING_RUN = 'npm run type-narrowing'
const TYPE_NARROWING_STEP = { name: 'type-narrowing', run: TYPE_NARROWING_RUN }
const NARROWING_SCRIPTS = { 'type-narrowing': 'tsc -p tsconfig.narrowing.json' }
/** The scripts the default steps and the declared `bench` step run: every step of these tests is wired. */
const WIRED_SCRIPTS = {
	'doc:build': 'node docs.js',
	'type-bench:check': 'node bench.js',
	bench: 'node bench.js',
}
/** The default steps as the resolution marks them. */
const DOCS_DEFAULT = { ...DOCS_STEP, isDefault: true }
const TYPE_BENCH_DEFAULT = { ...TYPE_BENCH_STEP, isDefault: true }

describe('resolveContribSteps scoped', () => {
	it.each([
		{ label: 'scoped', step: { name: 'bench', run: 'npm run bench', scoped: true } },
		{ label: 'a non-boolean heavy', step: { name: 'bench', run: 'npm run bench', heavy: 'yes' } },
	])('a contrib step with $label → a GateConfigError naming contrib and the step', ({ step }) => {
		const packageJson = { dialecte: { contrib: { steps: [step] } } } as PackageJson

		expect(() => resolveContribSteps({ packageJson })).toThrow(GateConfigError)
		expect(() => resolveContribSteps({ packageJson })).toThrow(/contrib.*bench|bench.*contrib/s)
	})

	it('a contrib step with heavy only → accepted as declared', () => {
		const heavy = { name: 'bench', run: 'npm run bench', heavy: true }

		expect(
			resolveContribSteps({
				packageJson: { scripts: WIRED_SCRIPTS, dialecte: { contrib: { steps: [heavy] } } },
			}),
		).toEqual([RULES_ROW, heavy, RELEASE_ROW])
	})
})

describe('resolveContribSteps', () => {
	it('without dialecte.contrib → rules, docs, type-bench, release', () => {
		expect(
			resolveContribSteps({
				packageJson: { scripts: WIRED_SCRIPTS, dialecte: { profile: 'contributor' } },
			}),
		).toEqual([RULES_ROW, DOCS_DEFAULT, TYPE_BENCH_DEFAULT, RELEASE_ROW])
	})

	it('with steps: [] → rules, release', () => {
		expect(resolveContribSteps({ packageJson: { dialecte: { contrib: { steps: [] } } } })).toEqual([
			RULES_ROW,
			RELEASE_ROW,
		])
	})

	it('with one declared step → rules, that step, release', () => {
		const declared = { name: 'bench', run: 'npm run bench' }

		expect(
			resolveContribSteps({
				packageJson: { scripts: WIRED_SCRIPTS, dialecte: { contrib: { steps: [declared] } } },
			}),
		).toEqual([RULES_ROW, declared, RELEASE_ROW])
	})

	it('a package with a type-narrowing script → rules, the declared or default steps, type-narrowing, release', () => {
		const declared = { name: 'bench', run: 'npm run bench' }

		const defaults = resolveContribSteps({
			packageJson: {
				scripts: { ...NARROWING_SCRIPTS, ...WIRED_SCRIPTS },
				dialecte: { profile: 'contributor' },
			},
		})
		const empty = resolveContribSteps({
			packageJson: { scripts: NARROWING_SCRIPTS, dialecte: { contrib: { steps: [] } } },
		})
		const one = resolveContribSteps({
			packageJson: {
				scripts: { ...NARROWING_SCRIPTS, ...WIRED_SCRIPTS },
				dialecte: { contrib: { steps: [declared] } },
			},
		})

		expect(defaults).toEqual([
			RULES_ROW,
			DOCS_DEFAULT,
			TYPE_BENCH_DEFAULT,
			TYPE_NARROWING_STEP,
			RELEASE_ROW,
		])
		expect(empty).toEqual([RULES_ROW, TYPE_NARROWING_STEP, RELEASE_ROW])
		expect(one).toEqual([RULES_ROW, declared, TYPE_NARROWING_STEP, RELEASE_ROW])
	})

	it('a declared step already running npm run type-narrowing, a package with the script → that step once, none added after it; the same declared steps without it get one', () => {
		const declared = { name: 'narrowing', run: TYPE_NARROWING_RUN }
		const without = resolveContribSteps({
			packageJson: {
				scripts: { ...NARROWING_SCRIPTS, ...WIRED_SCRIPTS },
				dialecte: { contrib: { steps: [DOCS_STEP] } },
			},
		})
		const alone = resolveContribSteps({
			packageJson: {
				scripts: NARROWING_SCRIPTS,
				dialecte: { contrib: { steps: [declared] } },
			},
		})
		const beside = resolveContribSteps({
			packageJson: {
				scripts: { ...NARROWING_SCRIPTS, ...WIRED_SCRIPTS },
				dialecte: { contrib: { steps: [DOCS_STEP, declared] } },
			},
		})

		expect(without).toEqual([RULES_ROW, DOCS_STEP, TYPE_NARROWING_STEP, RELEASE_ROW])
		expect(alone).toEqual([RULES_ROW, declared, RELEASE_ROW])
		expect(beside).toEqual([RULES_ROW, DOCS_STEP, declared, RELEASE_ROW])
	})
})
