/**
 * `dialecte gate [--fast | --full] [--json]` - the Definition of Done of the package, inside its
 * repository: `--fast` (default) while iterating, `--full` once per lot. Steps come from
 * `"dialecte": { "gate": { "fast", "full" } }` in package.json, or the defaults. One line per step with
 * the counts the step itself printed; refuses to run while a hand-over script holds the repository.
 */
import { hasFlag } from '../lib/config.ts'
import { resolveGateSteps } from '../lib/gate/gate-config.ts'
import { runGateSteps } from '../lib/gate/run-gate.ts'
import { renderStepCounts } from '../lib/gate/step-counts.ts'
import { handoverLockPath, readHandoverLock } from '../lib/handover/handover-lock.ts'
import { readPackageJson } from '../lib/package-json.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { GateMode, StepResult } from '../lib/gate/gate.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runGate({ cwd: process.cwd(), argv })
	console.log(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runGate(params: { cwd: string; argv: string[] }): CommandResult {
	const { cwd, argv } = params
	if (hasFlag(argv, 'fast') && hasFlag(argv, 'full'))
		return { exitCode: 2, output: 'gate: --fast or --full, not both' }
	const mode: GateMode = hasFlag(argv, 'full') ? 'full' : 'fast'
	const json = hasFlag(argv, 'json')

	const heldBy = readHandoverLock(cwd)
	if (heldBy)
		return {
			exitCode: 1,
			output: `gate: the repository is held by the hand-over ${heldBy} - run it first (it releases the lock), or drop the hand-over and delete ${handoverLockPath(cwd)}`,
		}

	const packageJson = readPackageJson(cwd)
	const results = runGateSteps({
		root: cwd,
		steps: resolveGateSteps({ packageJson, mode }),
		packageJson,
	})
	const failed = results.find((result) => result.status === 'failed')
	const exitCode = failed ? 1 : 0
	if (json)
		return {
			exitCode,
			output: JSON.stringify({ mode, ok: !failed, steps: results }, null, 2),
		}
	return {
		exitCode,
		output: [
			...results.map(renderStepLine),
			failed ? `gate --${mode}: failed at ${failed.step.name}` : `gate --${mode}: green`,
			...(failed?.tail ? [`--- last lines of ${failed.step.name} ---`, failed.tail] : []),
		].join('\n'),
	}
}

function renderStepLine(result: StepResult): string {
	const { step } = result
	if (result.status === 'not-run') return `--    ${step.name}  not run: an earlier step failed`
	if (result.status === 'skipped') return `skip  ${step.name}  ${result.reason}`
	const counts = renderStepCounts(result.counts)
	const restored = result.restored.length ? `restored ${result.restored.join(', ')}` : ''
	const failure = result.reason && result.reason !== `exit ${result.exitCode}` ? result.reason : ''
	return [
		result.status === 'passed' ? 'ok  ' : 'FAIL',
		step.name,
		`exit ${result.exitCode}`,
		counts,
		failure,
		result.note ?? '',
		restored,
	]
		.filter(Boolean)
		.join('  ')
}
