/**
 * `dialecte gate [--fast | --full | --release] [--base <ref>] [--no-reuse] [--declare <path>]... [--json]` |
 * `dialecte gate --hook [--no-reuse]` - the Definition of Done
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
 * A list holding a scoped step resolves its gate base once per run (`resolveGateBase`: `--base <ref>`, else the
 * base branch's merge-base, else the empty tree); the base enters the key, the scoped steps and the record. Without
 * a scoped step nothing is resolved and `--base` reads the tdd step only. `--release` (alone) runs
 * `dialecte.gate.release` (default: the full steps) like `--full`, its scoped steps against the empty tree, and
 * records `dialecte-gate-release.json`. A gate config the cli cannot run exits 2 (1 under `--hook`).
 *
 * `--hook [--no-reuse]` runs in a commit hook: the test steps of `--full` (those counting tests), unless a green
 * `--full` record of what is committed answers them - its key the tree of the index git hands the hook (never the
 * working files: a merge commit and a partial commit check what they record), what npm installed, the `file:`
 * dependencies and the full gate's command hash - else by a green `--release` record of the same tree when the
 * release list covers `full`. It prints one line saying which; no hygiene, no tdd step, no hand-over hold (it runs
 * inside `handover run`'s own commit), no record. When its test steps hold a scoped step it resolves the hook base
 * once - the hand-over base `handover run` hands down (`DIALECTE_HANDOVER_BASE` with `DIALECTE_HANDOVER_FOLDER`)
 * when a live run of that folder holds it, else the base branch's - and prints it on one more line with what was
 * selected (or `reused`).
 */
import { join } from 'node:path'

import { getArg, hasFlag } from '../lib/config.ts'
import { GATE_STEP_KINDS, HEAVY_STEP_KINDS } from '../lib/events/record-step.constants.ts'
import { partsOf, reuseOf, startStep } from '../lib/events/record-step.ts'
import { computeCheckKey, gateCommandHash } from '../lib/gate-records/check-key.ts'
import { findReusableRecord } from '../lib/gate-records/check-store.ts'
import { HYGIENE_STEP_NAME } from '../lib/gate-records/gate-records.constants.ts'
import {
	recordCheckedRun,
	renderReuseLine,
	reusedResults,
} from '../lib/gate-records/record-reuse.ts'
import { readEmptyTree, readGivenHandoverBase, resolveGateBase } from '../lib/gate/gate-base.ts'
import {
	GATE_BASE_FLAG_LINE,
	GATE_BASE_REFUSAL_LINE,
	GATE_CONFIG_REFUSAL,
	GATE_HOOK_MODE_REFUSAL,
	GATE_RELEASE_MODE_REFUSAL,
	GATE_REUSED_VERDICT,
	GATE_STATE_CHANGED_LINE,
	RELEASE_NOT_COVERING_LINE,
	STEP_DETAIL_INDENT,
} from '../lib/gate/gate-config.constants.ts'
import {
	GateConfigError,
	holdsScopedStep,
	listUncoveredFullSteps,
	renderAbsentDerivedLines,
	resolveGateSteps,
} from '../lib/gate/gate-config.ts'
import { runHookGate } from '../lib/gate/hook-gate.ts'
import { runGateSteps } from '../lib/gate/run-gate.ts'
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
import type { GateRunBase, HandoverBase } from '../lib/gate/gate-base.types.ts'
import type { GateStep } from '../lib/gate/gate-config.types.ts'
import type { GateMode, StepResult } from '../lib/gate/gate.types.ts'
import type { PackageJson } from '../lib/package-json.types.ts'
import type { LiveOutput, RunningStep } from '../lib/progress/step-progress.types.ts'
import type { Refusal } from '../lib/refusal.types.ts'

export async function run(argv: string[]): Promise<void> {
	// git hands a commit hook the index it commits; the cli cleared it from its own environment at start. When the
	// git variables given name another repository than this folder's, the cli ignores them: what is committed is
	// then unknown, and `gate --hook` runs the tests instead of keying an index that may not be the commit's
	const ignoredGivenRepository = namesAnotherRepository({
		given: GIVEN_ENVIRONMENT,
		folder: process.cwd(),
	})
	const indexFile = ignoredGivenRepository ? undefined : GIVEN_ENVIRONMENT.GIT_INDEX_FILE
	// the base a hand-over run hands its hooks: only `--hook` reads it
	const given = hasFlag(argv, 'hook') ? readGivenHandoverBase(GIVEN_ENVIRONMENT) : {}
	const result = await runGate({
		cwd: process.cwd(),
		argv,
		...(!hasFlag(argv, 'json') && { live: openProcessLiveOutput() }),
		...(indexFile && { indexFile }),
		...(ignoredGivenRepository && { reusable: false }),
		...(given.handoverBase && { handoverBase: given.handoverBase }),
		...(given.ignored && { handoverIgnored: given.ignored }),
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
	/**
	 * `--hook`: the base a hand-over run handed down (`DIALECTE_HANDOVER_BASE` with `DIALECTE_HANDOVER_FOLDER` in the
	 * cli's given environment), given to `resolveGateBase` (rule 2).
	 */
	handoverBase?: HandoverBase
	/** `--hook`: why a hand-over variable given without the other was ignored; said when a test step is scoped. */
	handoverIgnored?: string
	/** Where the one `events: not recorded: <reason>` line goes (standard error unless given). */
	warn?: (line: string) => void
}): Promise<CommandResult> {
	const { cwd, argv } = params
	if (
		hasFlag(argv, 'release') &&
		(hasFlag(argv, 'fast') || hasFlag(argv, 'full') || hasFlag(argv, 'hook'))
	)
		return { exitCode: 2, output: GATE_RELEASE_MODE_REFUSAL }
	if (hasFlag(argv, 'hook')) {
		if (hasFlag(argv, 'fast') || hasFlag(argv, 'full'))
			return { exitCode: 2, output: GATE_HOOK_MODE_REFUSAL }
		try {
			return await runHookGate({
				cwd,
				argv,
				indexFile: params.indexFile,
				reusable: params.reusable ?? true,
				live: params.live,
				handoverBase: params.handoverBase,
				handoverIgnored: params.handoverIgnored,
				warn: params.warn,
			})
		} catch (error) {
			// a broken gate config stops the commit, as any broken gate does
			if (error instanceof GateConfigError)
				return { exitCode: 1, output: GATE_CONFIG_REFUSAL.replace('{message}', error.message) }
			throw error
		}
	}
	if (hasFlag(argv, 'fast') && hasFlag(argv, 'full'))
		return { exitCode: 2, output: 'gate: --fast or --full, not both' }
	const mode: GateMode = hasFlag(argv, 'release')
		? 'release'
		: hasFlag(argv, 'full')
			? 'full'
			: 'fast'
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
	const resolved = resolveStepsOf({ packageJson, mode })
	if ('refusal' in resolved) return { exitCode: 2, output: resolved.refusal }
	const { steps } = resolved
	// the gate base, once per run and only for a list holding a scoped step; without one `--base` reads the tdd
	// step only, which runs every time: it is no part of what the steps check
	const scope = holdsScopedStep(steps)
		? resolveScopeOf({ cwd, mode, ref: getArg(argv, 'base') })
		: undefined
	if (scope && 'refusal' in scope)
		return { exitCode: 2, output: GATE_BASE_REFUSAL_LINE.replace('{refusal}', scope.refusal) }
	const gateBase = scope?.base
	const commandHash = gateCommandHash({ root: cwd, steps, gateBase: gateBase?.commit })
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
	// said once, before the steps: where the base came from, and a release list that answers no full gate
	const noticeLines = [
		...(scope?.lines ?? []),
		...(mode === 'release' ? notCoveringLines(packageJson) : []),
	]
	if (progress) for (const line of noticeLines) live?.writeLine(line)
	const results: StepResult[] = []
	let reused: { record: GateRecord; key: CheckKey } | undefined
	let keyBefore: CheckKey | undefined
	// the run's events: its start before any step, its end after the record (D12)
	const kind = GATE_STEP_KINDS[mode]
	const recorder = startStep({
		cwd,
		step: kind,
		heavy: HEAVY_STEP_KINDS.includes(kind),
		warn: params.warn,
	})
	const durations = new Map<StepResult, number>()
	const reusedParts = new Set<StepResult>()
	if (mode === 'fast') {
		const finishHygiene = recorder.startPart({ name: HYGIENE_STEP_NAME, heavy: false })
		const hygiene = hygieneStep({ cwd, declared: declaredPaths(argv) })
		durations.set(hygiene, finishHygiene())
		results.push(hygiene)
		if (progress) showLive({ result: hygiene })
	}
	if (results.some((result) => result.status === 'failed')) results.push(notRun(TDD_STEP))
	else {
		const running = progress?.start({ name: TDD_STEP.name, detail: 'the receipts of the change' })
		const finishTdd = recorder.startPart({ name: TDD_STEP.name, heavy: false })
		const tdd = await tddStep({
			cwd,
			packageJson,
			ref: getArg(argv, 'base'),
			wholeBranch: mode !== 'fast',
		})
		durations.set(tdd, finishTdd())
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
			reusedParts.add(result)
			if (progress) showLive({ result })
		}
	} else {
		const stepResults = await runGateSteps({
			root: cwd,
			steps,
			packageJson,
			// the tree the key holds: the one the scoped steps select on
			...(gateBase && keyBefore && { scope: { base: gateBase.commit, tree: keyBefore.tree } }),
			// always: the run's events time each part, progress shown or not (D8)
			announce: function announce(step) {
				const finishPart = recorder.startPart({ name: step.name, heavy: step.heavy === true })
				const running = progress?.start({ name: step.name, detail: step.run })
				return function finished(result) {
					durations.set(result, finishPart())
					if (running) showLive({ result, running })
				}
			},
		})
		results.push(...stepResults)
	}
	// a derived step the package has no script for: one skip line, no step of the record
	const derives =
		mode === 'full' || (mode === 'release' && packageJson.dialecte?.gate?.release === undefined)
	const absentLines = derives ? renderAbsentDerivedLines({ packageJson, steps }) : []
	if (progress) for (const line of absentLines) live?.writeLine(line)
	const keyAfter = reused?.key ?? computeCheckKey({ root: cwd, commandHash })
	const { stored, changedWhileRunning, stateHash } = recordCheckedRun({
		root: cwd,
		mode,
		results,
		keyBefore,
		keyAfter,
		...(reused && { reused: reused.record }),
		...(gateBase && { base: gateBase }),
	})
	const notStored = changedWhileRunning ? [GATE_STATE_CHANGED_LINE] : []

	const failed = results.find((result) => result.status === 'failed')
	const exitCode = failed ? 1 : 0
	const parts = partsOf({ results, durations, reused: reusedParts })
	recorder.end({ exit: exitCode, parts, reuse: reuseOf(parts), stateHash })
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
			...(params.live?.tty ? [] : noticeLines),
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

/** The steps of `mode`, or the refusal of a config the cli cannot run (`GateConfigError`). */
function resolveStepsOf(params: {
	packageJson: PackageJson
	mode: GateMode
}): { steps: GateStep[] } | Refusal {
	try {
		return { steps: resolveGateSteps(params) }
	} catch (error) {
		if (error instanceof GateConfigError)
			return { refusal: GATE_CONFIG_REFUSAL.replace('{message}', error.message) }
		throw error
	}
}

/**
 * The gate base of a run whose list holds a scoped step: `--release` the empty tree (everything changed, the
 * `--base` ref left to the tdd step); else `resolveGateBase` once, without a hand-over base (that is `--hook`'s),
 * with the line its note or a `--base` ref adds; a ref naming no commit answers its refusal.
 */
function resolveScopeOf(params: {
	cwd: string
	mode: GateMode
	ref: string | undefined
}): GateRunBase | Refusal {
	if (params.mode === 'release')
		return { base: { commit: readEmptyTree(params.cwd), source: 'release' }, lines: [] }
	const resolved = resolveGateBase({ root: params.cwd, ref: params.ref })
	if ('refusal' in resolved) return resolved
	return {
		base: { commit: resolved.commit, source: resolved.source },
		lines: [
			...(resolved.note ? [resolved.note] : []),
			...(resolved.source === 'flag' ? [GATE_BASE_FLAG_LINE] : []),
		],
	}
}

/** The line of a declared release list that does not cover `full`, naming the full steps it misses; none when it covers. */
function notCoveringLines(packageJson: PackageJson): string[] {
	const missing = listUncoveredFullSteps({ packageJson })
	return missing.length
		? [RELEASE_NOT_COVERING_LINE.replace('{steps}', missing.map((step) => step.name).join(', '))]
		: []
}

/** The worktree's hygiene as the first step of `--fast`. */
function hygieneStep(params: { cwd: string; declared: string[] }): StepResult {
	const report = checkHygiene({ root: params.cwd, declared: params.declared })
	const step: GateStep = { name: HYGIENE_STEP_NAME, run: '' }
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
