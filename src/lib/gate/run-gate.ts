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
 *
 * A scoped step gets the run's base and tree, the changed file the cli wrote for them and a selection path of its
 * own (`DIALECTE_GATE_*`), and is judged on the selection it writes there (`selection.ts`); no other step gets
 * those variables, and no step gets the hand-over's.
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
	GATE_SKIP_LABEL,
	NO_AFFECTED_TEST_NOTE,
	NO_AFFECTED_TEST_PATTERN,
	NO_TEST_RAN_REASON,
	NPM_RUN_PATTERN,
	REAL_FAILURE_PREFIX,
	SERIAL_FLAG,
	SERIAL_RUN_PATTERN,
	UNWIRED_NOT_RUN_REASON,
	VITEST_COMMAND_PATTERN,
	VITEST_ERROR_PATTERN,
} from './gate-config.constants.ts'
import { holdsScopedStep } from './gate-config.ts'
import {
	GATE_SCOPE_VARIABLES,
	HANDOVER_VARIABLES,
	NO_GATE_SCOPE_REASON,
} from './selection.constants.ts'
import {
	createScopeRun,
	judgeSelection,
	nothingSelectedNote,
	removeScopeRun,
	rerunIdsMismatch,
} from './selection.ts'
import { readStepCounts } from './step-counts.ts'
import { findUnwiredSteps } from './unwired-steps.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { Clock } from '../progress/clock.types.ts'
import type { Watchdog } from '../progress/run-child.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type {
	GateScope,
	ScopeRun,
	StepAnnouncer,
	StepCounts,
	StepResult,
	StepRun,
} from './gate.types.ts'

/**
 * The results of `steps`, run in order as the module says. Every step is judged for its wiring first
 * (`findUnwiredSteps`): a failed one (a declared step without its npm script, or a default one when
 * `failDefaultUnwired`) runs no step at all, each other step `not-run` with `UNWIRED_NOT_RUN_REASON`; a skipped
 * one (opted out, or a default step without its script otherwise) keeps its result and the others run.
 */
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
	/** The run's base and tree, resolved once by the caller: what a scoped step selects against. */
	scope?: GateScope
	/** An unwired default step fails the run (full, release, contrib) instead of being skipped (fast, hook). */
	failDefaultUnwired?: boolean
}): Promise<StepResult[]> {
	const { root, scope } = params
	// every step judged for its wiring before the first runs: a failed one runs nothing, so every wiring is fixed at once
	const unwired = findUnwiredSteps({
		steps: params.steps,
		packageJson: params.packageJson,
		failDefault: params.failDefaultUnwired === true,
		skipLabel: GATE_SKIP_LABEL,
	})
	if ([...unwired.values()].some((result) => result.status === 'failed'))
		return params.steps.map(function unwiredOrNotRun(step): StepResult {
			return (
				unwired.get(step) ?? {
					step,
					status: 'not-run',
					counts: {},
					restored: [],
					reason: UNWIRED_NOT_RUN_REASON,
				}
			)
		})
	// one changed file per run, written only when a step is scoped; removed whatever happens
	const scopeRun =
		scope !== undefined && holdsScopedStep(params.steps)
			? createScopeRun({ root, scope })
			: undefined
	try {
		return await runEachStep({ ...params, scopeRun, unwired })
	} finally {
		if (scopeRun) removeScopeRun(scopeRun)
	}
}

/**
 * The steps in order, the first failure stopping the rest (`runGateSteps`); a step `unwired` holds (skipped: opted
 * out, or a default step without its script in a run that does not fail it) takes that result, never announced.
 */
async function runEachStep(params: {
	root: string
	steps: readonly GateStep[]
	packageJson: PackageJson
	clock?: Clock
	watchdog?: Watchdog
	announce?: StepAnnouncer
	scopeRun: ScopeRun | undefined
	unwired: ReadonlyMap<GateStep, StepResult>
}): Promise<StepResult[]> {
	const { root, packageJson } = params
	const results: StepResult[] = []
	for (const step of params.steps) {
		if (results.some((result) => result.status === 'failed')) {
			results.push({ step, status: 'not-run', counts: {}, restored: [] })
			continue
		}
		const judged = params.unwired.get(step)
		if (judged) {
			results.push(judged)
			continue
		}
		const finished = params.announce?.(step)
		const run = {
			root,
			generatedDocs: packageJson.dialecte?.generatedDocs ?? [],
			clock: params.clock,
			watchdog: params.watchdog,
			scopeRun: params.scopeRun,
		}
		const first = await runStep({ ...run, step })
		// a first run whose selection failed its checks: no rerun can mend it, whatever its exit code
		const result =
			first.result.status === 'failed' &&
			!first.stalled &&
			first.selectionProblem === undefined &&
			isRerunnable({ step, packageJson, first }) &&
			!isAlreadySerial({ step, packageJson })
				? await rerunSerially({ ...run, step, first })
				: withFailing({ result: first.result, runs: [first] })
		results.push(result)
		finished?.(result)
	}
	return results
}

/**
 * A failed step the gate reruns serially on its failing files: a step counting tests that runs vitest; or a scoped
 * step counting tests (the scoped contract hands its arguments to the runner, whatever runs the script) whose run
 * exited non-zero on a test failure - a failed test counted, a failing file named, or vitest's error markers - since
 * a serial rerun mends only that; a plain script error fails as itself.
 */
function isRerunnable(params: {
	step: GateStep
	packageJson: PackageJson
	first: StepRun
}): boolean {
	const { step, first } = params
	if (isVitestTestStep(params)) return true
	if (step.scoped !== true || step.counts !== 'tests' || first.result.exitCode === 0) return false
	return (
		(first.result.counts.tests?.failed ?? 0) > 0 ||
		failingFiles(first.output).length > 0 ||
		VITEST_ERROR_PATTERN.test(first.output)
	)
}

/**
 * `result` with the files its runs name as failing (`failing`): those their whole output names and those a scoped
 * step's selection declares, sorted and unique; only on a failed or flaky step, and only when there are some.
 */
function withFailing(params: { result: StepResult; runs: readonly StepRun[] }): StepResult {
	const { result } = params
	if (result.status !== 'failed' && result.note !== FLAKY_NOTE) return result
	const failing = [
		...new Set(
			params.runs.flatMap((run) => [...failingFiles(run.output), ...(run.declaredFailing ?? [])]),
		),
	].sort()
	return failing.length ? { ...result, failing } : result
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

/**
 * The step once more, one file at a time, on the files its first run failed; its result judged on both runs. A
 * scoped step's rerun gets the same base, tree and changed file and a new selection path; it passes only when its
 * own selection is valid and selects the first run's ids (as a set); the result keeps the first run's selection.
 */
async function rerunSerially(params: {
	root: string
	step: GateStep
	generatedDocs: string[]
	clock?: Clock
	watchdog?: Watchdog
	scopeRun: ScopeRun | undefined
	first: StepRun
}): Promise<StepResult> {
	const { step } = params
	const first = params.first.result
	const files = failingFiles(params.first.output)
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
		scopeRun: params.scopeRun,
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
	const selectionFailure = step.scoped
		? rerunSelectionFailure({ first: params.first, rerun: rerun.result })
		: undefined
	const bothRuns = [params.first, rerun]
	if (passed && selectionFailure !== undefined)
		return withFailing({
			result: {
				...first,
				reason: selectionFailure,
				restored: [...first.restored, ...rerun.result.restored],
				rerun: outcome,
				...(details.length && { details }),
			},
			runs: bothRuns,
		})
	if (passed) {
		const { reason: _parallelReason, tail: _parallelTail, ...kept } = first
		// a flaky step keeps the files its first run failed
		return withFailing({
			result: {
				...kept,
				status: 'passed',
				note: FLAKY_NOTE,
				restored: [...first.restored, ...rerun.result.restored],
				rerun: outcome,
				...(details.length && { details }),
			},
			runs: [params.first],
		})
	}
	return withFailing({
		result: {
			...first,
			reason: `${REAL_FAILURE_PREFIX}${rerun.result.reason ?? NO_TEST_RAN_REASON}`,
			tail: rerun.result.tail,
			restored: [...first.restored, ...rerun.result.restored],
			rerun: outcome,
			...(details.length && { details }),
		},
		runs: bothRuns,
	})
}

/**
 * Why a passing serial rerun of a scoped step still fails on its selection: the first run's selection was refused,
 * or the rerun selected other ids; undefined when the rerun's ids are the first run's (in any order).
 */
function rerunSelectionFailure(params: { first: StepRun; rerun: StepResult }): string | undefined {
	const firstSelection = params.first.result.selection
	// no selection and no problem: the step had no scope to select against
	if (firstSelection === undefined) return params.first.selectionProblem ?? NO_GATE_SCOPE_REASON
	return rerunIdsMismatch({ first: firstSelection.ids, rerun: params.rerun.selection?.ids ?? [] })
}

/** The test files a vitest output names as failing, each once, in the order it names them. */
function failingFiles(output: string): string[] {
	return [...new Set([...output.matchAll(FAILING_FILE_PATTERN)].map((match) => match[1]))]
}

/**
 * One run of a step. Every step loses the hand-over's variables and the gate's own (a stray value never reaches
 * it); a scoped step then gets the run's base, tree, changed file and a new selection path, and its result is
 * judged on its selection after its exit code (`judgeScopedRun`).
 */
async function runStep(params: {
	root: string
	step: GateStep
	generatedDocs: string[]
	clock?: Clock
	watchdog?: Watchdog
	scopeRun: ScopeRun | undefined
}): Promise<StepRun> {
	const { root, step, scopeRun } = params
	if (step.scoped && scopeRun === undefined)
		return {
			output: '',
			stalled: false,
			result: { step, status: 'failed', counts: {}, restored: [], reason: NO_GATE_SCOPE_REASON },
		}
	const selectionPath = step.scoped ? scopeRun?.nextSelectionPath() : undefined
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
			...(scopeRun && selectionPath && scopeEnvironment({ scopeRun, selectionPath })),
		},
		unset: [...HANDOVER_VARIABLES, ...Object.values(GATE_SCOPE_VARIABLES)],
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
	if (scopeRun && selectionPath)
		return judgeScopedRun({ step, exitCode, counts, restored, output, scopeRun, selectionPath })
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

/** The variables a scoped step gets: the run's base and tree, its changed file, its own selection path. */
function scopeEnvironment(params: {
	scopeRun: ScopeRun
	selectionPath: string
}): Record<string, string> {
	return {
		[GATE_SCOPE_VARIABLES.base]: params.scopeRun.base,
		[GATE_SCOPE_VARIABLES.tree]: params.scopeRun.tree,
		[GATE_SCOPE_VARIABLES.changed]: params.scopeRun.changedFile,
		[GATE_SCOPE_VARIABLES.selection]: params.selectionPath,
	}
}

/**
 * The verdict of a scoped step that ran to its end, in order: its exit code; its selection (valid, of the run's
 * base and tree, of its count); an empty selection passes with a note unless a test failed or an error was
 * counted; a non-empty one is judged as any step (a test step that ran no test fails). A valid selection is kept
 * on the result whatever the verdict.
 */
function judgeScopedRun(params: {
	step: GateStep
	exitCode: number
	counts: StepCounts
	restored: string[]
	output: string
	scopeRun: ScopeRun
	selectionPath: string
}): StepRun {
	const { step, exitCode, counts, restored, output } = params
	const judged = judgeSelection({ path: params.selectionPath, scopeRun: params.scopeRun })
	const selection = 'selection' in judged ? judged.selection : undefined
	const selectionProblem = 'reason' in judged ? judged.reason : undefined
	const declaredFailing = 'failing' in judged ? judged.failing : undefined
	const kept = { step, exitCode, counts, restored, ...(selection && { selection }) }
	function failed(reason: string): StepRun {
		return {
			output,
			stalled: false,
			...(selectionProblem && { selectionProblem }),
			...(declaredFailing && { declaredFailing }),
			result: {
				...kept,
				status: 'failed',
				reason,
				tail: tailOf({ output, lines: FAILED_OUTPUT_TAIL_LINES }),
			},
		}
	}
	if (exitCode !== 0) return failed(`exit ${exitCode}`)
	if (selection === undefined) return failed(selectionProblem ?? NO_GATE_SCOPE_REASON)
	const reason = failureOf({ step, exitCode, counts })
	if (selection.ids.length === 0 && (reason === undefined || reason === NO_TEST_RAN_REASON))
		return {
			output,
			stalled: false,
			...(declaredFailing && { declaredFailing }),
			result: { ...kept, status: 'passed', note: nothingSelectedNote(selection) },
		}
	if (reason) return failed(reason)
	return {
		output,
		stalled: false,
		...(declaredFailing && { declaredFailing }),
		result: { ...kept, status: 'passed' },
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
