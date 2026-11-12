/**
 * `runGateSteps` judges the whole list for unwired steps before it runs the first one: a failed unwired step stops
 * every other step, an unwired or opted-out step is never announced as running.
 */
import { createCounter, countRuns } from '../../../test/scratch-checks.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { shellQuote } from '../shell-quote.ts'
import { UNWIRED_NOT_RUN_REASON } from './gate-config.constants.ts'
import { runGateSteps } from './run-gate.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { StepResult } from './gate.types.ts'

const NO_SCRIPTS: PackageJson = { scripts: {} }

/** A step that appends a line to `counter` when it runs. */
function countingStep(params: {
	name: string
	counter: string
	marks?: Partial<GateStep>
}): GateStep {
	return {
		name: params.name,
		run: `echo run >> ${shellQuote(params.counter)}`,
		...params.marks,
	}
}

/** What each result says: its step's name, status, reason and marks. */
function summaryOf(results: readonly StepResult[]) {
	return results.map(({ step, status, reason, unwired, optedOut }) => ({
		name: step.name,
		status,
		reason,
		unwired,
		optedOut,
	}))
}

/** The names the announcer was told, in order. */
async function runAnnounced(params: {
	steps: readonly GateStep[]
	failDefaultUnwired: boolean
}): Promise<{ results: StepResult[]; announced: string[] }> {
	const announced: string[] = []
	const results = await runGateSteps({
		root: temporaryFolder('dialecte-unwired-'),
		steps: params.steps,
		packageJson: NO_SCRIPTS,
		failDefaultUnwired: params.failDefaultUnwired,
		announce: function announce(step) {
			announced.push(step.name)
			return function finished() {}
		},
	})
	return { results, announced }
}

describe(
	'runGateSteps judges unwired steps before any step runs',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('failDefaultUnwired left out → a default unwired step is skipped as with false, the others run', async () => {
			const counter = createCounter()
			const steps: GateStep[] = [
				{ name: 'skills', run: 'npm run skills:check', isDefault: true },
				countingStep({ name: 'last', counter }),
			]

			const results = await runGateSteps({
				root: temporaryFolder('dialecte-unwired-'),
				steps,
				packageJson: NO_SCRIPTS,
			})

			expect({ results: summaryOf(results), runs: countRuns(counter) }).toEqual({
				results: [
					{
						name: 'skills',
						status: 'skipped',
						reason: 'not wired (no npm script "skills:check")',
						unwired: true,
					},
					{ name: 'last', status: 'passed' },
				],
				runs: 1,
			})
		})

		it('a default unwired step and failDefaultUnwired → it fails, the steps before and after it are not run, nothing is announced or run', async () => {
			const counter = createCounter()
			const steps: GateStep[] = [
				countingStep({ name: 'first', counter }),
				{ name: 'skills', run: 'npm run skills:check', isDefault: true },
				countingStep({ name: 'last', counter }),
			]

			const { results, announced } = await runAnnounced({ steps, failDefaultUnwired: true })

			expect({ results: summaryOf(results), announced, runs: countRuns(counter) }).toEqual({
				results: [
					{ name: 'first', status: 'not-run', reason: UNWIRED_NOT_RUN_REASON },
					{
						name: 'skills',
						status: 'failed',
						reason: 'not wired (no npm script "skills:check")',
						unwired: true,
					},
					{ name: 'last', status: 'not-run', reason: UNWIRED_NOT_RUN_REASON },
				],
				announced: [],
				runs: 0,
			})
		})

		it('a default unwired step without failDefaultUnwired → skipped and marked unwired, the others run, only they are announced', async () => {
			const counter = createCounter()
			const steps: GateStep[] = [
				countingStep({ name: 'first', counter }),
				{ name: 'skills', run: 'npm run skills:check', isDefault: true },
				countingStep({ name: 'last', counter }),
			]

			const { results, announced } = await runAnnounced({ steps, failDefaultUnwired: false })

			expect({ results: summaryOf(results), announced, runs: countRuns(counter) }).toEqual({
				results: [
					{ name: 'first', status: 'passed' },
					{
						name: 'skills',
						status: 'skipped',
						reason: 'not wired (no npm script "skills:check")',
						unwired: true,
					},
					{ name: 'last', status: 'passed' },
				],
				announced: ['first', 'last'],
				runs: 2,
			})
		})

		for (const failDefaultUnwired of [true, false]) {
			it(`a declared unwired step, failDefaultUnwired ${failDefaultUnwired} → it fails declared but not wired, the others are not run`, async () => {
				const counter = createCounter()
				const steps: GateStep[] = [
					countingStep({ name: 'first', counter }),
					{ name: 'lint', run: 'npm run lint' },
				]

				const { results, announced } = await runAnnounced({ steps, failDefaultUnwired })

				expect({ results: summaryOf(results), announced, runs: countRuns(counter) }).toEqual({
					results: [
						{ name: 'first', status: 'not-run', reason: UNWIRED_NOT_RUN_REASON },
						{
							name: 'lint',
							status: 'failed',
							reason: 'declared but not wired (no npm script "lint")',
							unwired: true,
						},
					],
					announced: [],
					runs: 0,
				})
			})
		}

		it('an opted-out step → skipped with its reason and optedOut, never announced, the other steps run', async () => {
			const counter = createCounter()
			const steps: GateStep[] = [
				{
					name: 'skills',
					run: 'npm run skills:check',
					isDefault: true,
					optedOut: 'no skills folder',
				},
				countingStep({ name: 'last', counter }),
			]

			const { results, announced } = await runAnnounced({ steps, failDefaultUnwired: true })

			expect({ results: summaryOf(results), announced, runs: countRuns(counter) }).toEqual({
				results: [
					{
						name: 'skills',
						status: 'skipped',
						reason: 'opted out: no skills folder',
						optedOut: 'no skills folder',
					},
					{ name: 'last', status: 'passed' },
				],
				announced: ['last'],
				runs: 1,
			})
		})

		it('two default unwired steps and failDefaultUnwired → both fail, each naming its script', async () => {
			const steps: GateStep[] = [
				{ name: 'skills', run: 'npm run skills:check', isDefault: true },
				{ name: 'build', run: 'npm run build', isDefault: true },
			]

			const { results } = await runAnnounced({ steps, failDefaultUnwired: true })

			expect(summaryOf(results)).toEqual([
				{
					name: 'skills',
					status: 'failed',
					reason: 'not wired (no npm script "skills:check")',
					unwired: true,
				},
				{
					name: 'build',
					status: 'failed',
					reason: 'not wired (no npm script "build")',
					unwired: true,
				},
			])
		})
	},
)
