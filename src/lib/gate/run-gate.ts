/**
 * Runs the gate's steps in order, each through the shell from the package root with its output
 * unfiltered, and decides on the exit code AND the counts it printed: a step exiting non-zero fails
 * whatever it says, a test step that counts no test fails, a failed test in the counts fails. The first
 * failure stops the gate. A step that runs only the tests a change affects passes, with a note, when
 * its runner finds none (a doc-only change). Generated docs a step rewrites are restored byte for byte, whatever its result.
 * Each step runs through `runChild`: stdin closed, and stopped as stalled when it prints nothing and its
 * processes gain no CPU for `stallAfter`, its process tree in the tail.
 *
 * A vitest test step that fails (not one that stalled, nor one already run one file at a time) is rerun once with
 * `--no-file-parallelism`, on the failing files its output names (the whole step when it names none): passing there,
 * the step passes flagged flaky in parallel; failing there, it fails as a real failure with the rerun's tail.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { GIT_READ_ENVIRONMENT } from '../git.constants.ts'
import { runChild } from '../progress/run-child.ts'
import { stallReason } from '../progress/stall-reason.ts'
import { tailOf } from '../progress/tail-of.ts'
import { shellQuote } from '../shell-quote.ts'
import {
	ARGUMENT_SEPARATOR_PATTERN,
	FAILED_OUTPUT_TAIL_LINES,
	FAILING_FILE_PATTERN,
	FLAKY_NOTE,
	NO_AFFECTED_TEST_NOTE,
	NO_AFFECTED_TEST_PATTERN,
	NO_TEST_RAN_REASON,
	NPM_RUN_PATTERN,
	REAL_FAILURE_PREFIX,
	SERIAL_FLAG,
	SERIAL_RUN_PATTERN,
	VITEST_COMMAND_PATTERN,
} from './gate-config.constants.ts'
import { readStepCounts } from './step-counts.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { Clock } from '../progress/clock.types.ts'
import type { Watchdog } from '../progress/run-child.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { StepAnnouncer, StepCounts, StepResult } from './gate.types.ts'

export async function runGateSteps(params: {
	root: string
	steps: readonly GateStep[]
	packageJson: PackageJson
	/** Default: the system clock. */
	clock?: Clock
	/** Default: stalled after 10 min, sampled every 5 s, with the machine's tools. */
	watchdog?: Watchdog
	/** Told when a step starts and with its result (a start line or a spinner); default: nothing shown. */
	announce?: StepAnnouncer
}): Promise<StepResult[]> {
	const { root, packageJson } = params
	const results: StepResult[] = []
	for (const step of params.steps) {
		if (results.some((result) => result.status === 'failed')) {
			results.push({ step, status: 'not-run', counts: {}, restored: [] })
			continue
		}
		const script = NPM_RUN_PATTERN.exec(step.run)?.[1]
		if (script && !packageJson.scripts?.[script]) {
			results.push({
				step,
				status: 'skipped',
				counts: {},
				restored: [],
				reason: `no npm script "${script}"`,
			})
			continue
		}
		const finished = params.announce?.(step)
		const run = {
			root,
			generatedDocs: packageJson.dialecte?.generatedDocs ?? [],
			clock: params.clock,
			watchdog: params.watchdog,
		}
		const first = await runStep({ ...run, step })
		const result =
			first.result.status === 'failed' &&
			!first.stalled &&
			isVitestTestStep({ step, packageJson }) &&
			!isAlreadySerial({ step, packageJson })
				? await rerunSerially({ ...run, step, first: first.result, output: first.output })
				: first.result
		results.push(result)
		finished?.(result)
	}
	return results
}

/** A step that counts tests and runs vitest: its command names it, or the npm script it runs does. */
function isVitestTestStep(params: { step: GateStep; packageJson: PackageJson }): boolean {
	const { step } = params
	if (step.counts !== 'tests') return false
	if (VITEST_COMMAND_PATTERN.test(step.run)) return true
	const script = NPM_RUN_PATTERN.exec(step.run)?.[1]
	return (
		script !== undefined && VITEST_COMMAND_PATTERN.test(params.packageJson.scripts?.[script] ?? '')
	)
}

/** The step runs one file at a time already: its command, or the npm script it runs, turns file parallelism off. */
function isAlreadySerial(params: { step: GateStep; packageJson: PackageJson }): boolean {
	const { step } = params
	const script = NPM_RUN_PATTERN.exec(step.run)?.[1]
	return [step.run, script ? (params.packageJson.scripts?.[script] ?? '') : ''].some((command) =>
		SERIAL_RUN_PATTERN.test(command),
	)
}

/** The step once more, one file at a time, on the files its first run failed; its result judged on both runs. */
async function rerunSerially(params: {
	root: string
	step: GateStep
	generatedDocs: string[]
	clock?: Clock
	watchdog?: Watchdog
	first: StepResult
	output: string
}): Promise<StepResult> {
	const { step, first } = params
	const files = failingFiles(params.output)
	const words = [...files.map(shellQuote), SERIAL_FLAG].join(' ')
	// through npm the words go to the script, after the one `--`
	const separator =
		NPM_RUN_PATTERN.test(step.run) && !ARGUMENT_SEPARATOR_PATTERN.test(step.run) ? ' --' : ''
	const rerun = await runStep({
		root: params.root,
		step: { ...step, run: `${step.run}${separator} ${words}` },
		generatedDocs: params.generatedDocs,
		clock: params.clock,
		watchdog: params.watchdog,
	})
	const failing = failingFiles(rerun.output)
	// a rerun that ran no test proves nothing, even one a `--changed` step lets pass
	const passed = rerun.result.status === 'passed' && (rerun.result.counts.tests?.passed ?? 0) > 0
	const details = files.map((file) => `${failing.includes(file) ? 'failed' : 'flaky'}  ${file}`)
	const outcome = {
		files,
		failing,
		status: passed ? ('passed' as const) : ('failed' as const),
		exitCode: rerun.result.exitCode ?? 1,
		counts: rerun.result.counts,
	}
	if (passed) {
		const { reason: _parallelReason, tail: _parallelTail, ...kept } = first
		return {
			...kept,
			status: 'passed',
			note: FLAKY_NOTE,
			restored: [...first.restored, ...rerun.result.restored],
			rerun: outcome,
			...(details.length && { details }),
		}
	}
	return {
		...first,
		reason: `${REAL_FAILURE_PREFIX}${rerun.result.reason ?? NO_TEST_RAN_REASON}`,
		tail: rerun.result.tail,
		restored: [...first.restored, ...rerun.result.restored],
		rerun: outcome,
		...(details.length && { details }),
	}
}

/** The test files a vitest output names as failing, each once, in the order it names them. */
function failingFiles(output: string): string[] {
	return [...new Set([...output.matchAll(FAILING_FILE_PATTERN)].map((match) => match[1]))]
}

async function runStep(params: {
	root: string
	step: GateStep
	generatedDocs: string[]
	clock?: Clock
	watchdog?: Watchdog
}): Promise<{ result: StepResult; output: string; stalled: boolean }> {
	const { root, step } = params
	const snapshot = step.restoresGeneratedDocs
		? snapshotFiles({ root, files: params.generatedDocs })
		: new Map<string, Buffer | undefined>()
	const execution = await runChild({
		command: 'sh',
		args: ['-c', step.run],
		cwd: root,
		environment: {
			FORCE_COLOR: '0',
			NO_COLOR: '1',
			// a git status a step runs while a hand-over commits must not take index.lock
			...GIT_READ_ENVIRONMENT,
		},
		clock: params.clock,
		watchdog: params.watchdog,
	})
	const restored = restoreFiles({ root, snapshot })
	const { output, stalled } = execution
	const counts = readStepCounts(output)
	if (stalled)
		return {
			output,
			stalled: true,
			result: {
				step,
				status: 'failed',
				counts,
				restored,
				reason: stallReason({ watchdog: params.watchdog }),
				tail: [
					tailOf({ output, lines: FAILED_OUTPUT_TAIL_LINES }),
					'its processes, killed:',
					stalled.report,
				]
					.filter(Boolean)
					.join('\n'),
			},
		}
	const exitCode = execution.exitCode ?? 1
	if (exitCode === 0 && !counts.tests && step.changedOnly && NO_AFFECTED_TEST_PATTERN.test(output))
		return {
			output,
			stalled: false,
			result: { step, status: 'passed', exitCode, counts, restored, note: NO_AFFECTED_TEST_NOTE },
		}
	const reason = failureOf({ step, exitCode, counts })
	return {
		output,
		stalled: false,
		result: {
			step,
			status: reason ? 'failed' : 'passed',
			exitCode,
			counts,
			restored,
			...(reason && { reason, tail: tailOf({ output, lines: FAILED_OUTPUT_TAIL_LINES }) }),
		},
	}
}

/** Why the step failed, or undefined when it passed. */
function failureOf(params: {
	step: GateStep
	exitCode: number
	counts: StepCounts
}): string | undefined {
	const { step, exitCode, counts } = params
	if (exitCode !== 0) return `exit ${exitCode}`
	if (counts.tests?.failed) return `${counts.tests.failed} test(s) failed`
	if (counts.errors) return `${counts.errors} error(s)`
	if (step.counts === 'tests' && !counts.tests?.passed) return NO_TEST_RAN_REASON
	return undefined
}

function snapshotFiles(params: { root: string; files: string[] }): Map<string, Buffer | undefined> {
	return new Map(
		params.files.map((file) => {
			const path = join(params.root, file)
			return [file, existsSync(path) ? readFileSync(path) : undefined]
		}),
	)
}

/** Writes back every file whose bytes changed (removes one that did not exist); answers which. */
function restoreFiles(params: {
	root: string
	snapshot: Map<string, Buffer | undefined>
}): string[] {
	const restored: string[] = []
	for (const [file, before] of params.snapshot) {
		const path = join(params.root, file)
		const after = existsSync(path) ? readFileSync(path) : undefined
		if (before === undefined && after === undefined) continue
		if (before && after && before.equals(after)) continue
		if (before) writeFileSync(path, before)
		else rmSync(path, { force: true, recursive: true })
		restored.push(file)
	}
	return restored
}
