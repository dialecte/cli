/**
 * `dialecte gate [--fast | --full] [--no-wait] [--declare <path>]... [--json]` - the Definition of Done
 * of the package, inside its repository: `--fast` (default) while iterating, `--full` once per lot. Steps
 * come from `"dialecte": { "gate": { "fast", "full" } }` in package.json, or the defaults. One line per
 * step with the counts the step itself printed; refuses to run while a hand-over script holds the
 * repository.
 *
 * `--fast` starts with the hygiene of the worktree (nothing staged, the stash as it was when the worktree
 * was made, new files declared). `--full`, and every heavy step, hold the machine-wide lock: one heavy run
 * at a time on a machine; a second one waits (a line every 30 s naming the holder) or, with `--no-wait`,
 * refuses.
 */
import { resolve } from 'node:path'

import { hasFlag } from '../lib/config.ts'
import { resolveGateSteps } from '../lib/gate/gate-config.ts'
import { runGateSteps } from '../lib/gate/run-gate.ts'
import { renderStepCounts } from '../lib/gate/step-counts.ts'
import { handoverLockPath, readHandoverLock } from '../lib/handover/handover-lock.ts'
import {
	acquireMachineLock,
	describeHolder,
	machineLockPath,
} from '../lib/machine-lock/machine-lock.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { checkHygiene } from '../lib/worktree/hygiene.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { GateStep } from '../lib/gate/gate-config.types.ts'
import type { GateMode, StepLock, StepResult } from '../lib/gate/gate.types.ts'
import type { WriteLine } from '../lib/handover/handover.types.ts'
import type { Clock } from '../lib/progress/clock.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runGate({ cwd: process.cwd(), argv })
	console.log(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runGate(params: {
	cwd: string
	argv: string[]
	/** The machine lock: its file, the clock it waits with, where its waiting lines go. */
	machineLock?: { path: string; clock: Clock; write: WriteLine; isAlive?: (pid: number) => boolean }
}): CommandResult {
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
	const steps = resolveGateSteps({ packageJson, mode })
	const machineLock = params.machineLock ?? {
		path: machineLockPath(),
		clock: createSystemClock(),
		write: (line: string) => console.error(line),
	}
	function lockFor(command: string): { release(): void } | { refusal: string } {
		const outcome = acquireMachineLock({
			path: machineLock.path,
			command,
			wait: !hasFlag(argv, 'no-wait'),
			clock: machineLock.clock,
			write: machineLock.write,
			isAlive: machineLock.isAlive,
		})
		return outcome.acquired
			? outcome
			: { refusal: `the machine lock is held (--no-wait): ${describeHolder(outcome.holder)}` }
	}
	function lockStep(step: GateStep): ReturnType<StepLock> {
		return lockFor(`dialecte gate --${mode} (${step.name}) in ${resolve(cwd)}`)
	}

	const results: StepResult[] = []
	if (mode === 'fast') results.push(hygieneStep({ cwd, declared: declaredPaths(argv) }))
	const gateLock = mode === 'full' ? lockFor(`dialecte gate --full in ${resolve(cwd)}`) : undefined
	if (gateLock && 'refusal' in gateLock)
		results.push({
			step: { name: 'machine lock', run: '' },
			status: 'failed',
			counts: {},
			restored: [],
			reason: gateLock.refusal,
		})
	try {
		if (results.some((result) => result.status === 'failed')) results.push(...steps.map(notRun))
		else results.push(...runGateSteps({ root: cwd, steps, packageJson, lockStep }))
	} finally {
		if (gateLock && !('refusal' in gateLock)) gateLock.release()
	}

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

/** The worktree's hygiene as the first step of `--fast`. */
function hygieneStep(params: { cwd: string; declared: string[] }): StepResult {
	const report = checkHygiene({ root: params.cwd, declared: params.declared })
	const step: GateStep = { name: 'hygiene', run: '' }
	const note = [...report.notes, ...report.warnings.map((warning) => `warning: ${warning}`)].join(
		'; ',
	)
	if (report.failures.length)
		return {
			step,
			status: 'failed',
			counts: {},
			restored: [],
			reason: report.failures.join('; '),
			tail: ['look (read-only):', ...report.look.map((command) => `  ${command}`)].join('\n'),
			...(note && { note }),
		}
	return { step, status: 'passed', counts: {}, restored: [], ...(note && { note }) }
}

/** Every `--declare <path>` of the command line. */
function declaredPaths(argv: readonly string[]): string[] {
	return argv.flatMap((argument, index) =>
		argument === '--declare' && argv[index + 1] ? [argv[index + 1]] : [],
	)
}

function notRun(step: GateStep): StepResult {
	return { step, status: 'not-run', counts: {}, restored: [] }
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
		result.exitCode === undefined ? '' : `exit ${result.exitCode}`,
		counts,
		failure,
		result.note ?? '',
		restored,
	]
		.filter(Boolean)
		.join('  ')
}
