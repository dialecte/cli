/**
 * `runGateSteps` and a self step whose cli command cannot be resolved: that step fails with the reason, the gate
 * itself never throws, and the steps around it keep their lines.
 */
import { createCounter, countRuns } from '../../../test/scratch-checks.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { shellQuote } from '../shell-quote.ts'
import { runGateSteps } from './run-gate.ts'
import { renderStepLine } from './step-line.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'

const NO_SCRIPTS: PackageJson = { scripts: {} }
const MISSING_BIN_MESSAGE = 'the cli package.json has no dialecte bin'

/** A command resolver that fails the way a package with no `dialecte` bin does. */
function resolveMissingBin(): string[] {
	throw new Error(MISSING_BIN_MESSAGE)
}

/** A step that appends a line to `counter` when it runs. */
function countingStep(params: { name: string; counter: string }): GateStep {
	return { name: params.name, run: `echo run >> ${shellQuote(params.counter)}` }
}

describe(
	'runGateSteps with a self step whose cli command cannot be resolved',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a self step between two steps and no resolvable bin → it does not throw, the self step fails naming the missing bin, the step before passed, the one after is not run', async () => {
			const counter = createCounter()
			const steps: GateStep[] = [
				countingStep({ name: 'first', counter }),
				{ name: 'rules', run: 'dialecte rules' },
				countingStep({ name: 'last', counter }),
			]

			const results = await runGateSteps({
				root: temporaryFolder('dialecte-self-step-'),
				steps,
				packageJson: NO_SCRIPTS,
				resolveOwnCommand: resolveMissingBin,
			})

			expect({
				statuses: results.map(function nameAndStatus(result) {
					return [result.step.name, result.status]
				}),
				rulesLine: renderStepLine(results[1]),
				runs: countRuns(counter),
			}).toEqual({
				statuses: [
					['first', 'passed'],
					['rules', 'failed'],
					['last', 'not-run'],
				],
				rulesLine: expect.stringMatching(/^FAIL\s+rules\b.*no dialecte bin/),
				runs: 1,
			})
		})
	},
)
