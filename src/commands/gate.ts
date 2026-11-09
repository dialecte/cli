/**
 * `dialecte gate [--fast | --full] [--base <ref>] [--no-reuse] [--declare <path>]... [--json]` | `dialecte gate --hook
 * [--no-reuse]` - the Definition of Done
 * of the package, inside its repository: `--fast` (default) while iterating, `--full` once per lot. Steps
 * come from `"dialecte": { "gate": { "fast", "full" } }` in package.json, or the defaults. One line per
 * step with the counts the step itself printed. While a hand-over script holds the repository it runs only
 * under the hand-over written for this repository (its lots file names it) when no real run of it is in
 * progress, and says so in one line; it refuses otherwise.
 *
 * `--fast` starts with the hygiene of the worktree (nothing staged, the stash as it was when the worktree
 * was made, new files declared). Steps run with the runner's defaults; a vitest test step that fails is rerun
 * once, serially, on its failing files, and its line says which: flaky in parallel or a real failure. The `tdd`
 * step measures the lot from HEAD (the uncommitted work); `--base <ref>` and `--full` (before a merge) measure the
 * whole branch.
 *
 * A run that reaches its steps records them in the worktree's git folder (`dialecte-gate-<mode>.json`),
 * for the hand-over card, with the key of what it checked: the tree, what npm installed, the steps, the
 * `file:` dependencies' folders. A run whose steps ran also goes to the repository's store of records by
 * tree, which every worktree of the repository reads. A green record of the same mode and key answers the
 * steps instead of running them (`--no-reuse` runs them whatever the store holds); the hygiene and the `tdd`
 * step, which are about the worktree and not the tree, run every time.
 *
 * `--hook [--no-reuse]` runs in a commit hook: the test steps of `--full` (those counting tests), unless a green
 * `--full` record of what is committed answers them - its key the tree of the index git hands the hook (never the
 * working files: a merge commit and a partial commit check what they record), what npm installed, the `file:`
 * dependencies and the full gate's command hash. It prints one line saying which; no hygiene, no tdd step, no
 * hand-over hold (it runs inside `handover run`'s own commit), no record.
 */
import { join } from 'node:path'

import { getArg, hasFlag } from '../lib/config.ts'
import {
	computeCheckKey,
	computeCommitKey,
	gateCommandHash,
} from '../lib/gate-records/check-key.ts'
import { findReusableRecord, originOfRecord } from '../lib/gate-records/check-store.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import {
	recordCheckedRun,
	renderReuseLine,
	reusedResults,
} from '../lib/gate-records/record-reuse.ts'
import {
	GATE_HOOK_FAILED_LINE,
	GATE_HOOK_GREEN_LINE,
	GATE_HOOK_MODE_REFUSAL,
	GATE_HOOK_NO_TEST_STEP_LINE,
	GATE_HOOK_REUSED_LINE,
	GATE_HOOK_RUNNING_LINE,
	GATE_REUSED_VERDICT,
	GATE_STATE_CHANGED_LINE,
	STEP_DETAIL_INDENT,
} from '../lib/gate/gate-config.constants.ts'
import { renderAbsentDerivedLines, resolveGateSteps } from '../lib/gate/gate-config.ts'
import { runGateSteps } from '../lib/gate/run-gate.ts'
import { renderVitestTestsLine, sumStepCounts } from '../lib/gate/step-counts.ts'
import { renderStepLine } from '../lib/gate/step-line.ts'
import { namesAnotherRepository } from '../lib/git-environment.ts'
import { GIVEN_ENVIRONMENT } from '../lib/given-environment.constants.ts'
import { readHandoverHold } from '../lib/handover/handover-lock.ts'
import { GATE_UNDER_HANDOVER, HANDOVER_FILES } from '../lib/handover/handover.constants.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { openProcessLiveOutput } from '../lib/progress/process-live-output.ts'
import { createStepProgress } from '../lib/progress/step-progress.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { TDD_STEP } from '../lib/tdd/tdd.constants.ts'
import { checkHygiene } from '../lib/worktree/hygiene.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { CheckKey, GateRecord } from '../lib/gate-records/gate-records.types.ts'
import type { GateStep } from '../lib/gate/gate-config.types.ts'
import type { GateMode, StepResult } from '../lib/gate/gate.types.ts'
import type { PackageJson } from '../lib/package-json.types.ts'
import type { LiveOutput, RunningStep } from '../lib/progress/step-progress.types.ts'

export async function run(argv: string[]): Promise<void> {
	// git hands a commit hook the index it commits; the cli cleared it from its own environment at start. When the
	// git variables given name another repository than this folder's, the cli ignores them: what is committed is
	// then unknown, and `gate --hook` runs the tests instead of keying an index that may not be the commit's
	const ignoredGivenRepository = namesAnotherRepository({
		given: GIVEN_ENVIRONMENT,
		folder: process.cwd(),
	})
	const indexFile = ignoredGivenRepository ? undefined : GIVEN_ENVIRONMENT.GIT_INDEX_FILE
	const result = await runGate({
		cwd: process.cwd(),
		argv,
		...(!hasFlag(argv, 'json') && { live: openProcessLiveOutput() }),
		...(indexFile && { indexFile }),
		...(ignoredGivenRepository && { reusable: false }),
	})
	console.log(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export async function runGate(params: {
	cwd: string
	argv: string[]
	/** Where each step's start line (or spinner) goes while it runs; the result is returned at the end. */
	live?: LiveOutput
	/** `--hook`: the index file git handed the commit hook (relative: to the worktree top); default: the worktree's own index. */
	indexFile?: string
	/** `--hook`: false when what is committed is unknown (git variables naming another repository): the tests run. */
	reusable?: boolean
}): Promise<CommandResult> {
	const { cwd, argv } = params
	if (hasFlag(argv, 'hook')) {
		if (hasFlag(argv, 'fast') || hasFlag(argv, 'full'))
			return { exitCode: 2, output: GATE_HOOK_MODE_REFUSAL }
		return runHookGate({
			cwd,
			argv,
			indexFile: params.indexFile,
			reusable: params.reusable ?? true,
			live: params.live,
		})
	}
	if (hasFlag(argv, 'fast') && hasFlag(argv, 'full'))
		return { exitCode: 2, output: 'gate: --fast or --full, not both' }
	const mode: GateMode = hasFlag(argv, 'full') ? 'full' : 'fast'
	const json = hasFlag(argv, 'json')

	const hold = readHandoverHold(cwd)
	if ('refusal' in hold) return { exitCode: 1, output: `gate: ${hold.refusal}` }
	const underHandover =
		'folder' in hold
			? [
					GATE_UNDER_HANDOVER.replace('{folder}', hold.folder).replace(
						'{lots}',
						join(hold.folder, HANDOVER_FILES.lots),
					),
				]
			: []

	const packageJson = readPackageJson(cwd)
	const steps = resolveGateSteps({ packageJson, mode })
	// `--base` reads the tdd step only, which runs every time: it is no part of what the steps check
	const commandHash = gateCommandHash({ root: cwd, steps })
	const shownLive = new Set<StepResult>()
	const progress = params.live
		? createStepProgress({ live: params.live, clock: createSystemClock() })
		: undefined
	const { live } = params
	/** The step's line (and the lines under it), live, in run order. */
	function showLive(shown: { result: StepResult; running?: RunningStep }): void {
		const lines = [
			renderStepLine(shown.result),
			...(shown.result.details ?? []).map((line) => `${STEP_DETAIL_INDENT}${line}`),
		]
		if (shown.running) shown.running.finish(...lines)
		else for (const line of lines) live?.writeLine(line)
		shownLive.add(shown.result)
	}
	const results: StepResult[] = []
	let reused: { record: GateRecord; key: CheckKey } | undefined
	let keyBefore: CheckKey | undefined
	if (mode === 'fast') {
		const hygiene = hygieneStep({ cwd, declared: declaredPaths(argv) })
		results.push(hygiene)
		if (progress) showLive({ result: hygiene })
	}
	if (results.some((result) => result.status === 'failed')) results.push(notRun(TDD_STEP))
	else {
		const running = progress?.start({ name: TDD_STEP.name, detail: 'the receipts of the change' })
		const tdd = await tddStep({
			cwd,
			packageJson,
			ref: getArg(argv, 'base'),
			wholeBranch: mode === 'full',
		})
		results.push(tdd)
		if (running) showLive({ result: tdd, running })
	}
	// the key of the state the steps start on: a record is stored only when they leave it the same
	keyBefore = results.some((result) => result.status === 'failed')
		? undefined
		: computeCheckKey({ root: cwd, commandHash })
	const found =
		keyBefore && !hasFlag(argv, 'no-reuse')
			? findReusableRecord({ root: cwd, mode, key: keyBefore })
			: undefined
	reused = found && keyBefore && { record: found, key: keyBefore }
	if (results.some((result) => result.status === 'failed')) results.push(...steps.map(notRun))
	else if (reused) {
		if (progress)
			live?.writeLine(renderReuseLine({ command: `gate --${mode}`, record: reused.record }))
		for (const result of reusedResults({
			record: reused.record,
			steps,
			leftOut: [TDD_STEP.name],
		})) {
			results.push(result)
			if (progress) showLive({ result })
		}
	} else {
		const stepResults = await runGateSteps({
			root: cwd,
			steps,
			packageJson,
			...(progress && {
				announce: function announce(step) {
					const running = progress.start({ name: step.name, detail: step.run })
					return function finished(result) {
						showLive({ result, running })
					}
				},
			}),
		})
		results.push(...stepResults)
	}
	// a derived step the package has no script for: one skip line, no step of the record
	const absentLines = mode === 'full' ? renderAbsentDerivedLines({ packageJson, steps }) : []
	if (progress) for (const line of absentLines) live?.writeLine(line)
	const keyAfter = reused?.key ?? computeCheckKey({ root: cwd, commandHash })
	const { stored, changedWhileRunning } = recordCheckedRun({
		root: cwd,
		mode,
		results,
		keyBefore,
		keyAfter,
		...(reused && { reused: reused.record }),
	})
	const notStored = changedWhileRunning ? [GATE_STATE_CHANGED_LINE] : []

	const failed = results.find((result) => result.status === 'failed')
	const exitCode = failed ? 1 : 0
	if (json)
		return {
			exitCode,
			output: JSON.stringify(
				{ mode, ok: !failed, ...(reused && { reused: true }), stored, steps: results },
				null,
				2,
			),
		}
	const reuseLine = reused && renderReuseLine({ command: `gate --${mode}`, record: reused.record })
	return {
		exitCode,
		output: [
			...underHandover,
			// on a terminal a step's line is on the screen already: the summary does not repeat it
			...results
				.filter((result) => !(params.live?.tty && shownLive.has(result)))
				.flatMap((result) => [
					renderStepLine(result),
					...(result.details ?? []).map((line) => `${STEP_DETAIL_INDENT}${line}`),
					// the steps after the tdd step are the record's: said once, before them
					...(reuseLine && result.step.name === TDD_STEP.name ? [reuseLine] : []),
				]),
			...(params.live?.tty ? [] : absentLines),
			...notStored,
			failed
				? `gate --${mode}: failed at ${failed.step.name}`
				: reused
					? GATE_REUSED_VERDICT.replace('{mode}', mode)
					: `gate --${mode}: green`,
			...(failed?.tail ? [`--- last lines of ${failed.step.name} ---`, failed.tail] : []),
		].join('\n'),
	}
}

/**
 * `gate --hook`: the full gate's test steps for the commit being made, answered by a green `--full` record of
 * its key, else run (their lines, one vitest summary line of their summed counts, then the verdict).
 */
async function runHookGate(params: {
	cwd: string
	argv: string[]
	indexFile: string | undefined
	reusable: boolean
	live: LiveOutput | undefined
}): Promise<CommandResult> {
	const { cwd } = params
	const packageJson = readPackageJson(cwd)
	const fullSteps = resolveGateSteps({ packageJson, mode: 'full' })
	const testSteps = fullSteps.filter((step) => step.counts === 'tests')
	if (testSteps.length === 0) return { exitCode: 0, output: GATE_HOOK_NO_TEST_STEP_LINE }
	const key = computeCommitKey({
		root: cwd,
		commandHash: gateCommandHash({ root: cwd, steps: fullSteps }),
		...(params.indexFile && { indexFile: params.indexFile }),
	})
	const shortTree = key.tree.slice(0, SHORT_SHA_LENGTH)
	const found =
		!params.reusable || hasFlag(params.argv, 'no-reuse')
			? undefined
			: findReusableRecord({ root: cwd, mode: 'full', key })
	if (found) {
		const { at, head } = originOfRecord(found)
		return {
			exitCode: 0,
			output: GATE_HOOK_REUSED_LINE.replace('{tree}', shortTree)
				.replace('{at}', at)
				.replace('{head}', head.slice(0, SHORT_SHA_LENGTH)),
		}
	}
	const runningLine = GATE_HOOK_RUNNING_LINE.replace('{tree}', shortTree)
	const { live } = params
	const progress = live ? createStepProgress({ live, clock: createSystemClock() }) : undefined
	live?.writeLine(runningLine)
	const results = await runGateSteps({
		root: cwd,
		steps: testSteps,
		packageJson,
		...(progress && {
			announce: function announce(step) {
				const running = progress.start({ name: step.name, detail: step.run })
				return function finished(result) {
					running.finish(...hookStepLines(result))
				}
			},
		}),
	})
	const failed = results.find((result) => result.status === 'failed')
	// one line for every step: a hook's reader reads the last summary line of the hook's step
	const summary = renderVitestTestsLine(sumStepCounts(results.map((result) => result.counts)))
	if (summary && live?.tty) live.writeLine(summary)
	return {
		exitCode: failed ? 1 : 0,
		output: [
			// on a terminal the lines are on the screen already
			...(live?.tty ? [] : [runningLine, ...results.flatMap(hookStepLines)]),
			...(summary && !live?.tty ? [summary] : []),
			failed ? GATE_HOOK_FAILED_LINE.replace('{step}', failed.step.name) : GATE_HOOK_GREEN_LINE,
			...(failed?.tail ? [`--- last lines of ${failed.step.name} ---`, failed.tail] : []),
		].join('\n'),
	}
}

/** A test step `gate --hook` ran: its line and the lines under it (the files a rerun named). */
function hookStepLines(result: StepResult): string[] {
	return [
		renderStepLine(result),
		...(result.details ?? []).map((line) => `${STEP_DETAIL_INDENT}${line}`),
	]
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

/** The receipts of the change's test cases, after the hygiene. */
async function tddStep(params: {
	cwd: string
	packageJson: PackageJson
	ref: string | undefined
	wholeBranch: boolean
}): Promise<StepResult> {
	const check = await checkTddReceipts({
		root: params.cwd,
		packageJson: params.packageJson,
		ref: params.ref,
		wholeBranch: params.wholeBranch,
	})
	return {
		step: TDD_STEP,
		status: check.status,
		counts: {},
		restored: [],
		...(check.reason && { reason: check.reason }),
		...(check.note && { note: check.note }),
		...(check.lines?.length && { tail: check.lines.join('\n') }),
		...(check.details?.length && { details: check.details }),
		...(check.cases && { cases: check.cases }),
		...(check.moved?.length && { moved: check.moved }),
	}
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
