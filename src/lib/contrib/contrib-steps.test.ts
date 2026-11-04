import { resolveContribSteps } from './contrib-steps.ts'

import { describe, expect, it } from 'vitest'

const RULES_ROW = { name: 'rules', builtin: 'rules' }
const RELEASE_ROW = { name: 'release', builtin: 'release' }
const DOCS_STEP = { name: 'docs', run: 'npm run doc:build', restoresGeneratedDocs: true }
const TYPE_BENCH_STEP = { name: 'type-bench', run: 'npm run type-bench:check' }

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
})
