import { resolveContribSteps } from './contrib-steps.ts'

import { describe, expect, it } from 'vitest'

const RULES_ROW = { name: 'rules', builtin: 'rules' }
const RELEASE_ROW = { name: 'release', builtin: 'release' }
const DOCS_STEP = { name: 'docs', run: 'npm run doc:build', restoresGeneratedDocs: true }
const TYPE_BENCH_STEP = { name: 'type-bench', run: 'npm run type-bench:check' }
const TYPE_NARROWING_RUN = 'npm run type-narrowing'
const TYPE_NARROWING_STEP = { name: 'type-narrowing', run: TYPE_NARROWING_RUN }
const NARROWING_SCRIPTS = { 'type-narrowing': 'tsc -p tsconfig.narrowing.json' }

describe('resolveContribSteps', () => {
	it('without dialecte.contrib → rules, docs, type-bench, release', () => {
		expect(resolveContribSteps({ packageJson: { dialecte: { profile: 'contributor' } } })).toEqual([
			RULES_ROW,
			DOCS_STEP,
			TYPE_BENCH_STEP,
			RELEASE_ROW,
		])
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
			resolveContribSteps({ packageJson: { dialecte: { contrib: { steps: [declared] } } } }),
		).toEqual([RULES_ROW, declared, RELEASE_ROW])
	})

	it('a package with a type-narrowing script → rules, the declared or default steps, type-narrowing, release', () => {
		const declared = { name: 'bench', run: 'npm run bench' }

		const defaults = resolveContribSteps({
			packageJson: { scripts: NARROWING_SCRIPTS, dialecte: { profile: 'contributor' } },
		})
		const empty = resolveContribSteps({
			packageJson: { scripts: NARROWING_SCRIPTS, dialecte: { contrib: { steps: [] } } },
		})
		const one = resolveContribSteps({
			packageJson: { scripts: NARROWING_SCRIPTS, dialecte: { contrib: { steps: [declared] } } },
		})

		expect(defaults).toEqual([
			RULES_ROW,
			DOCS_STEP,
			TYPE_BENCH_STEP,
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
				scripts: NARROWING_SCRIPTS,
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
				scripts: NARROWING_SCRIPTS,
				dialecte: { contrib: { steps: [DOCS_STEP, declared] } },
			},
		})

		expect(without).toEqual([RULES_ROW, DOCS_STEP, TYPE_NARROWING_STEP, RELEASE_ROW])
		expect(alone).toEqual([RULES_ROW, declared, RELEASE_ROW])
		expect(beside).toEqual([RULES_ROW, DOCS_STEP, declared, RELEASE_ROW])
	})
})
