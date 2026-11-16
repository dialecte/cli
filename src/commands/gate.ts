/**
 * `dialecte gate [--fast | --full | --release] [--base <ref>] [--no-reuse] [--declare <path>]... [--json]` |
 * `dialecte gate --hook [--no-reuse]` - the Definition of Done
 * of the package, inside its repository: `--fast` (default) while iterating, `--full` once per lot. Steps
 * come from `"dialecte": { "gate": { "fast", "full" } }` in package.json, or the defaults; without a package.json,
 * from a root dialecte.json and the steps the repository's files tell (`readStepSource`). One line per
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
 * `--hook [--no-reuse]` runs in a commit hook the `dialecte.gate.hook` steps when the package declares them (a package
 * whose suite runs on CI), after the tdd receipts of the lot (`runHookTddStep`: they prove the commit, so no test
 * runs; a failure runs no step); else the hook steps of `--full`: every full step but the scoped ones that count no
 * tests (a commit has no lot base for them), with no tdd step. Each step is answered by the newest green record of what
 * is committed that ran it as it is now - any mode (`--fast`, `--full`, `--release`, an earlier hook), its key the tree
 * of the index git hands the hook (never the working files: a merge commit and a partial commit check what they
 * record), what npm installed and the `file:` dependencies, the step itself its own hash (a scoped step's with the hook
 * base, or recorded by a run that checked everything) - and says so on one line naming the run that really ran it:
 * `gate --hook: reused <step> from <mode> <time> (HEAD <short>)`. The steps no record answers run together, in list
 * order, with their usual lines and the verdict. A green `--full` (or covering `--release`) record of an older cli,
 * with no step hashes, still answers the test steps as a whole, with its one line. `--no-reuse`, or git variables
 * naming another repository, answer nothing. No hygiene, no hand-over hold (it runs inside `handover run`'s own
 * commit). Every run with a HEAD writes its own record, mode `hook-gate`: each step with its hash, an answered one with
 * the run it came from; it goes to the repository's store, or - given `DIALECTE_CHECK_STORE`, the absolute git common
 * dir of the repository a rehearsal clones - to that store, marked as a rehearsal's (any other value is ignored, said
 * on the hook's first line; no step ever sees the variable). The record is kept only when the working files were the
 * committed tree before and after the steps ran: a step reads the working files, so a run on others answers nothing of
 * the tree. When a hook step is scoped it resolves the hook base once - the hand-over base `handover run` hands down
 * (`DIALECTE_HANDOVER_BASE` with `DIALECTE_HANDOVER_FOLDER`) when a live run of that folder holds it, else the base
 * branch's - and prints it on one more line with what was selected (or `reused`).
 */
import { join } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { getArg, hasFlag } from '../lib/config.ts'
import { GATE_STEP_KINDS, HEAVY_STEP_KINDS } from '../lib/events/record-step.constants.ts'
import { partsOf, reuseOf, startStep } from '../lib/events/record-step.ts'
import { computeCheckKey, gateCommandHash } from '../lib/gate-records/check-key.ts'
import { findReusableRecord } from '../lib/gate-records/check-store.ts'
import { HYGIENE_STEP_NAME } from '../lib/gate-records/gate-records.constants.ts'
import { GATE_NO_HEAD_LINE } from '../lib/gate-records/no-head.constants.ts'
import {
	recordCheckedRun,
	renderReuseLine,
	reusedResults,
} from '../lib/gate-records/record-reuse.ts'
import { computeStateTree } from '../lib/gate-records/state-hash.ts'
import { hashGateStep } from '../lib/gate-records/step-reuse.ts'
import { readEmptyTree, readGivenHandoverBase, resolveGateBase } from '../lib/gate/gate-base.ts'
import {
	GATE_BASE_FLAG_LINE,
	GATE_BASE_REFUSAL_LINE,
	GATE_CONFIG_REFUSAL,
	GATE_FAILED_TAIL_LINE,
	GATE_HOOK_MODE_REFUSAL,
	GATE_RELEASE_MODE_REFUSAL,
	GATE_REUSED_VERDICT,
	GATE_STATE_CHANGED_LINE,
	RELEASE_NOT_COVERING_LINE,
} from '../lib/gate/gate-config.constants.ts'
import {
	GateConfigError,
	holdsScopedStep,
	listUncoveredFullSteps,
	renderAbsentDerivedLines,
	resolveGateSteps,
} from '../lib/gate/gate-config.ts'
import { readGivenCheckStore } from '../lib/gate/given-check-store.ts'
import { runHookGate } from '../lib/gate/hook-gate.ts'
import { runGateSteps } from '../lib/gate/run-gate.ts'
import { renderStepLines } from '../lib/gate/step-line.ts'
import { readStepSource } from '../lib/gate/step-source.ts'
import { runTddStep } from '../lib/gate/tdd-step.ts'
import { namesAnotherRepository } from '../lib/git-environment.ts'
import { readHeadOrNone } from '../lib/git.ts'
import { GIVEN_ENVIRONMENT } from '../lib/given-environment.constants.ts'
import { readHandoverHold } from '../lib/handover/handover-lock.ts'
import { GATE_UNDER_HANDOVER, HANDOVER_FILES } from '../lib/handover/handover.constants.ts'
import { startLongRun } from '../lib/keep-awake/long-run.ts'
import { jsonOf, joinedOf, printOut, textOf } from '../lib/print/print.ts'
import { childLinesOf, relayedTextOf } from '../lib/print/relayed.ts'
import { openProcessLiveOutput } from '../lib/progress/process-live-output.ts'
import { createStepProgress } from '../lib/progress/step-progress.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { shellQuote, shellWord } from '../lib/shell-quote.ts'
import { TDD_STEP } from '../lib/tdd/tdd.constants.ts'
import { checkHygiene } from '../lib/worktree/hygiene.ts'
import { checkInstallMatchesTree } from '../lib/worktree/tree-install.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { StepHandle } from '../lib/events/record-step.types.ts'
import type { CheckKey, GateRecord, RecordedRun } from '../lib/gate-records/gate-records.types.ts'
import type { GateRunBase } from '../lib/gate/gate-base.types.ts'
import type { GateStep } from '../lib/gate/gate-config.types.ts'
import type { GateMode, StepResult } from '../lib/gate/gate.types.ts'
import type { PackageJson } from '../lib/package-json.types.ts'
import type { LiveOutput, RunningStep } from '../lib/progress/step-progress.types.ts'
import type { Refusal } from '../lib/refusal.types.ts'
import type { GatePhase, GateReuse, GateRunParams, GateSetup, GateView } from './gate.types.ts'

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
	// a rehearsal clone's gate reads and writes the store of the repository it rehearses: an absolute folder only
	const store = readGivenCheckStore({
		environment: GIVEN_ENVIRONMENT,
		command: `gate --${hasFlag(argv, 'hook') ? 'hook' : modeOf(argv)}`,
	})
	const result = await runGate({
		cwd: process.cwd(),
		argv,
		...(!hasFlag(argv, 'json') && { live: openProcessLiveOutput() }),
		...(indexFile && { indexFile }),
		...(ignoredGivenRepository && { reusable: false }),
		...(given.handoverBase && { handoverBase: given.handoverBase }),
		...(given.ignored && { handoverIgnored: given.ignored }),
		...(store.checkStore && { checkStore: store.checkStore }),
		...(store.ignored && { checkStoreIgnored: store.ignored }),
	})
	printOut({ stream: 'stdout', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export async function runGate(params: GateRunParams): Promise<CommandResult> {
	const refused = refuseModeFlags(params.argv)
	if (refused) return refused
	if (hasFlag(params.argv, 'hook')) return runHookMode(params)
	return runModeGate({ ...params, mode: modeOf(params.argv) })
}

/** The refusal of flags that name two modes at once; undefined when the command line names one at most. */
function refuseModeFlags(argv: string[]): CommandResult | undefined {
	if (
		hasFlag(argv, 'release') &&
		(hasFlag(argv, 'fast') || hasFlag(argv, 'full') || hasFlag(argv, 'hook'))
	)
		return resultOf({ exitCode: 2, lines: [GATE_RELEASE_MODE_REFUSAL] })
	if (hasFlag(argv, 'hook') && (hasFlag(argv, 'fast') || hasFlag(argv, 'full')))
		return resultOf({ exitCode: 2, lines: [GATE_HOOK_MODE_REFUSAL] })
	if (hasFlag(argv, 'fast') && hasFlag(argv, 'full'))
		return resultOf({ exitCode: 2, lines: ['gate: --fast or --full, not both'] })
	return undefined
}

/** The mode of a run that is not `--hook`: `--release`, `--full`, else `--fast`. */
function modeOf(argv: string[]): GateMode {
	if (hasFlag(argv, 'release')) return 'release'
	return hasFlag(argv, 'full') ? 'full' : 'fast'
}

/** `--hook`: the commit hook's run (`runHookGate`); a gate config the cli cannot run stops the commit (exit 1). */
async function runHookMode(params: GateRunParams): Promise<CommandResult> {
	try {
		return await runHookGate({
			cwd: params.cwd,
			argv: params.argv,
			indexFile: params.indexFile,
			reusable: params.reusable ?? true,
			live: params.live,
			handoverBase: params.handoverBase,
			handoverIgnored: params.handoverIgnored,
			...(params.checkStore && { checkStore: params.checkStore }),
			...(params.checkStoreIgnored && { checkStoreIgnored: params.checkStoreIgnored }),
			warn: params.warn,
		})
	} catch (error) {
		// a broken gate config stops the commit, as any broken gate does
		if (error instanceof GateConfigError)
			return resultOf({
				exitCode: 1,
				lines: [GATE_CONFIG_REFUSAL.replace('{message}', () => error.message)],
			})
		throw error
	}
}

/**
 * A `--fast`, `--full` or `--release` run: the worktree's own steps (the hygiene, the tdd step), then the steps of
 * the list, answered by a green record of the same key or run; the run is recorded, then said.
 */
async function runModeGate(params: GateRunParams & { mode: GateMode }): Promise<CommandResult> {
	const { cwd, argv, mode } = params
	// a long run: the machine stays awake while it lasts, and its record says when it slept all the same
	const sleptSinceStart =
		mode === 'fast'
			? undefined
			: startLongRun({ holdAwake: params.holdAwake, runClocks: params.runClocks })
	const setup = readGateSetup(params)
	if ('refused' in setup) return setup.refused
	const view: GateView = params.live
		? {
				live: params.live,
				progress: createStepProgress({ live: params.live, clock: createSystemClock() }),
			}
		: {}
	if (view.progress) for (const line of setup.noticeLines) view.live?.writeLine(textOf([line]))
	// the run's events: its start before any step, its end after the record (D12)
	const kind = GATE_STEP_KINDS[mode]
	const recorder = startStep({
		cwd,
		step: kind,
		heavy: HEAVY_STEP_KINDS.includes(kind),
		warn: params.warn,
	})
	const { packageJson } = setup.source
	const worktree = await runWorktreeSteps({ cwd, argv, mode, packageJson, recorder, view })
	const worktreeFailed = worktree.results.some((result) => result.status === 'failed')
	const reuse = findReuse({ cwd, argv, mode, setup, failed: worktreeFailed })
	const checked = await runListSteps({
		cwd,
		mode,
		setup,
		recorder,
		view,
		reuse,
		failed: worktreeFailed,
	})
	const results = [...worktree.results, ...checked.results]
	const absentLines = absentDerivedLines({ setup, mode })
	if (view.progress) for (const line of absentLines) view.live?.writeLine(textOf([line]))
	const sleptMs = sleptSinceStart?.()
	const recorded = recordGateRun({ cwd, mode, setup, results, reuse, sleptMs })
	endGateEvents({ recorder, argv, worktree, checked, reuse, recorded })
	return renderGateResult({
		mode,
		json: hasFlag(argv, 'json'),
		live: params.live,
		setup,
		results,
		shown: new Set([...worktree.shown, ...checked.shown]),
		absentLines,
		notStored: recorded.notStored,
		stored: recorded.stored,
		reused: reuse.reused?.record,
	})
}

/**
 * What a run reads before any step: the hand-over hold, the install of the lock being checked, the step source, the
 * steps of `mode` and - only for a list holding a scoped step - the gate base, once per run; a refusal of any of them
 * is the run's answer.
 */
function readGateSetup(
	params: Pick<GateRunParams, 'cwd' | 'argv' | 'checkStore' | 'checkStoreIgnored'> & {
		mode: GateMode
	},
): GateSetup | { refused: CommandResult } {
	const { cwd, mode } = params
	const hold = readHandoverHold(cwd)
	if ('refusal' in hold)
		return { refused: resultOf({ exitCode: 1, lines: [`gate: ${hold.refusal}`] }) }
	// a node_modules that does not install the lock being checked: no step runs, nothing is recorded
	const installRefusal =
		readHeadOrNone(cwd) === undefined
			? undefined
			: checkInstallMatchesTree({ root: cwd, tree: computeStateTree(cwd) })
	if (installRefusal !== undefined)
		return { refused: resultOf({ exitCode: 1, lines: [`gate: ${installRefusal}`] }) }
	const source = readStepSource(cwd)
	if ('refusal' in source) {
		const line = GATE_CONFIG_REFUSAL.replace('{message}', () => source.refusal)
		return { refused: resultOf({ exitCode: 2, lines: [line] }) }
	}
	const resolved = resolveStepsOf({ packageJson: source.packageJson, mode })
	if ('refusal' in resolved)
		return { refused: resultOf({ exitCode: 2, lines: [resolved.refusal] }) }
	const { steps } = resolved
	// without a scoped step `--base` reads the tdd step only, which runs every time: no part of what the steps check
	const scope = holdsScopedStep(steps)
		? resolveScopeOf({ cwd, mode, ref: getArg(params.argv, 'base') })
		: undefined
	if (scope && 'refusal' in scope) {
		const line = GATE_BASE_REFUSAL_LINE.replace('{refusal}', () => scope.refusal)
		return { refused: resultOf({ exitCode: 2, lines: [line] }) }
	}
	const gateBase = scope?.base
	return {
		underHandover:
			'folder' in hold
				? [
						// the folder's own lots file and the folder as --out: the command works from any place in the repository
						GATE_UNDER_HANDOVER.replace('{folder}', () => hold.folder)
							.replace('{lots}', () => shellQuote(join(hold.folder, HANDOVER_FILES.lots)))
							.replace('{out}', () => ` --out ${shellWord(hold.folder)}`),
					]
				: [],
		source,
		steps,
		...(gateBase && { gateBase }),
		...(params.checkStore && { checkStore: params.checkStore }),
		commandHash: gateCommandHash({ root: cwd, steps, gateBase: gateBase?.commit }),
		noticeLines: [
			...(params.checkStoreIgnored ? [params.checkStoreIgnored] : []),
			...(scope?.lines ?? []),
			...(mode === 'release' ? notCoveringLines(source.packageJson) : []),
		],
	}
}

/** A step's line and the lines under it, shown live: under its running line when it has one. */
function showStepLive(params: { view: GateView; result: StepResult; running?: RunningStep }): void {
	const lines = renderStepLines(params.result).map((line) => textOf([line]))
	if (params.running) params.running.finish(...lines)
	else for (const line of lines) params.view.live?.writeLine(line)
}

/** The worktree's own steps, run every time: the hygiene (`--fast` only), then the tdd step unless it failed. */
async function runWorktreeSteps(params: {
	cwd: string
	argv: string[]
	mode: GateMode
	packageJson: PackageJson
	recorder: StepHandle
	view: GateView
}): Promise<GatePhase> {
	const { cwd, argv, mode, recorder, view } = params
	const phase: GatePhase = { results: [], durations: new Map(), shown: new Set() }
	if (mode === 'fast') {
		const finishHygiene = recorder.startPart({ name: HYGIENE_STEP_NAME, heavy: false })
		const hygiene = hygieneStep({ cwd, declared: declaredPaths(argv) })
		phase.durations.set(hygiene, finishHygiene())
		phase.results.push(hygiene)
		if (view.progress) {
			showStepLive({ view, result: hygiene })
			phase.shown.add(hygiene)
		}
	}
	if (phase.results.some((result) => result.status === 'failed')) {
		phase.results.push(notRun(TDD_STEP))
		return phase
	}
	const running = view.progress?.start({
		name: TDD_STEP.name,
		detail: 'the receipts of the change',
	})
	const finishTdd = recorder.startPart({ name: TDD_STEP.name, heavy: false })
	const tdd = await runTddStep({
		cwd,
		packageJson: params.packageJson,
		ref: getArg(argv, 'base'),
		wholeBranch: mode !== 'fast',
	})
	phase.durations.set(tdd, finishTdd())
	phase.results.push(tdd)
	if (running) {
		showStepLive({ view, result: tdd, running })
		phase.shown.add(tdd)
	}
	return phase
}

/**
 * HEAD, the key of the state the steps start on, and the green record of the same mode and key that answers them
 * (none under `--no-reuse`). A repository with no commit yet reuses and keeps none (its tdd step refuses first today;
 * the guard holds should that step ever pass without a commit); a failed worktree step keys nothing.
 */
function findReuse(params: {
	cwd: string
	argv: string[]
	mode: GateMode
	setup: GateSetup
	failed: boolean
}): GateReuse {
	const { cwd } = params
	const head = readHeadOrNone(cwd)
	// a record is stored only when the steps leave this state the same
	const keyBefore =
		head === undefined || params.failed
			? undefined
			: computeCheckKey({ root: cwd, commandHash: params.setup.commandHash })
	const found =
		keyBefore && !hasFlag(params.argv, 'no-reuse')
			? findReusableRecord({
					root: cwd,
					mode: params.mode,
					key: keyBefore,
					...(params.setup.checkStore && { checkStore: params.setup.checkStore }),
				})
			: undefined
	return {
		head,
		...(keyBefore && { keyBefore }),
		...(found && keyBefore && { reused: { record: found, key: keyBefore } }),
	}
}

/** The steps of the list: not run after a failed worktree step, answered by the record found, else run. */
async function runListSteps(params: {
	cwd: string
	mode: GateMode
	setup: GateSetup
	recorder: StepHandle
	view: GateView
	reuse: GateReuse
	failed: boolean
}): Promise<GatePhase> {
	const { setup, view, recorder } = params
	const phase: GatePhase = { results: [], durations: new Map(), shown: new Set() }
	if (params.failed) return { ...phase, results: setup.steps.map(notRun) }
	const { reused, keyBefore } = params.reuse
	if (reused) {
		if (view.progress)
			view.live?.writeLine(
				renderReuseLine({ command: `gate --${params.mode}`, record: reused.record }),
			)
		const answered = reusedResults({
			record: reused.record,
			steps: setup.steps,
			leftOut: [TDD_STEP.name],
		})
		for (const result of answered) {
			phase.results.push(result)
			if (view.progress) {
				showStepLive({ view, result })
				phase.shown.add(result)
			}
		}
		return phase
	}
	const results = await runGateSteps({
		root: params.cwd,
		steps: setup.steps,
		packageJson: setup.source.packageJson,
		// the tree the key holds: the one the scoped steps select on
		...(setup.gateBase &&
			keyBefore && { scope: { base: setup.gateBase.commit, tree: keyBefore.tree } }),
		// a default step without its npm script fails a full or release run; a fast one says it and goes on
		failDefaultUnwired: params.mode !== 'fast',
		// always: the run's events time each part, progress shown or not (D8)
		announce: function announce(step) {
			const finishPart = recorder.startPart({ name: step.name, heavy: step.heavy === true })
			const running = view.progress?.start({ name: step.name, detail: step.run })
			return function finished(result) {
				phase.durations.set(result, finishPart())
				if (running) {
					showStepLive({ view, result, running })
					phase.shown.add(result)
				}
			}
		},
	})
	return { ...phase, results }
}

/**
 * The skip line of each derived step the package has no script for (no step of the record): `--full`, and
 * `--release` without its own list. Only a package.json has npm scripts to derive from: a repository without one
 * says nothing of them.
 */
function absentDerivedLines(params: { setup: GateSetup; mode: GateMode }): string[] {
	const { source, steps } = params.setup
	const { mode } = params
	const derives =
		source.origin === 'package.json' &&
		(mode === 'full' ||
			(mode === 'release' && source.packageJson.dialecte?.gate?.release === undefined))
	return derives ? renderAbsentDerivedLines({ packageJson: source.packageJson, steps }) : []
}

/**
 * The run's end event (D12), after its record: its exit, each part's time (the list's parts reused when a record
 * answered them), the key of the record it stored (none when it stored nothing) and whether it ran under `--no-reuse`.
 */
function endGateEvents(params: {
	recorder: StepHandle
	argv: string[]
	worktree: GatePhase
	checked: GatePhase
	reuse: GateReuse
	recorded: RecordedRun & { key?: CheckKey }
}): void {
	const { worktree, checked, recorded } = params
	const results = [...worktree.results, ...checked.results]
	const parts = partsOf({
		results,
		durations: new Map([...worktree.durations, ...checked.durations]),
		reused: new Set(params.reuse.reused ? checked.results : []),
	})
	params.recorder.end({
		exit: results.some((result) => result.status === 'failed') ? 1 : 0,
		parts,
		reuse: reuseOf(parts),
		stateHash: recorded.stateHash,
		...(recorded.key && { key: recorded.key }),
		...(hasFlag(params.argv, 'no-reuse') && { noReuse: true }),
	})
}

/**
 * The run's record, for the card and the repository's store, with the key it was stored under (none when it stored
 * nothing: a reused run, a state changed while it ran) and the lines saying why it was not kept: the working files
 * changed while the steps ran, or no HEAD to key it on.
 */
function recordGateRun(params: {
	cwd: string
	mode: GateMode
	setup: GateSetup
	results: StepResult[]
	reuse: GateReuse
	sleptMs: number | undefined
}): RecordedRun & { key?: CheckKey; notStored: string[] } {
	const { cwd, mode, setup, reuse, sleptMs } = params
	const { gateBase } = setup
	if (reuse.head === undefined)
		return {
			stored: false,
			stateHash: null,
			notStored: [GATE_NO_HEAD_LINE.replace('{command}', `gate --${mode}`)],
		}
	const keyAfter =
		reuse.reused?.key ?? computeCheckKey({ root: cwd, commandHash: setup.commandHash })
	const { stored, changedWhileRunning, stateHash } = recordCheckedRun({
		root: cwd,
		mode,
		results: params.results,
		keyBefore: reuse.keyBefore,
		keyAfter,
		...(reuse.reused && { reused: reuse.reused.record }),
		...(setup.checkStore && { checkStore: setup.checkStore }),
		...(gateBase && { base: gateBase }),
		...(sleptMs !== undefined && { sleptMs }),
		stepHashes: new Map(
			setup.steps.map((step) => [
				step.name,
				hashGateStep({ root: cwd, step, gateBase: gateBase?.commit }),
			]),
		),
	})
	return {
		stored,
		stateHash,
		...(stored && { key: keyAfter }),
		notStored: changedWhileRunning ? [GATE_STATE_CHANGED_LINE] : [],
	}
}

/**
 * What the run says: its JSON, or its lines - the hold, the notices, each step not shown live yet with the reuse line
 * after the tdd step, the skip lines, why it was not stored, the verdict - then the failed step's own last lines.
 */
function renderGateResult(params: {
	mode: GateMode
	json: boolean
	live: LiveOutput | undefined
	setup: GateSetup
	results: StepResult[]
	shown: ReadonlySet<StepResult>
	absentLines: string[]
	notStored: string[]
	stored: boolean
	reused: GateRecord | undefined
}): CommandResult {
	const { mode, results, reused } = params
	const failed = results.find((result) => result.status === 'failed')
	const exitCode = failed ? 1 : 0
	if (params.json)
		return {
			exitCode,
			output: jsonOf(
				{
					mode,
					ok: !failed,
					...(reused && { reused: true }),
					stored: params.stored,
					steps: results,
				},
				2,
			),
		}
	const tty = params.live?.tty
	const reuseLine = reused && renderReuseLine({ command: `gate --${mode}`, record: reused })
	const own = textOf([
		...params.setup.underHandover,
		...(tty ? [] : params.setup.noticeLines),
		// on a terminal a step's line is on the screen already: the summary does not repeat it
		...results
			.filter((result) => !(tty && params.shown.has(result)))
			.flatMap((result) => [
				...renderStepLines(result),
				// the steps after the tdd step are the record's: said once, before them
				...(reuseLine && result.step.name === TDD_STEP.name ? [reuseLine] : []),
			]),
		...(tty ? [] : params.absentLines),
		...params.notStored,
		failed
			? `gate --${mode}: failed at ${failed.step.name}`
			: reused
				? GATE_REUSED_VERDICT.replace('{mode}', mode)
				: `gate --${mode}: green`,
		...(failed?.tail ? [GATE_FAILED_TAIL_LINE.replace('{step}', failed.step.name)] : []),
	])
	return {
		exitCode,
		// the failed step's last lines are its own output, relayed line by line
		output: failed?.tail ? joinedOf([own, relayedTextOf(childLinesOf(failed.tail))]) : own,
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
			return { refusal: GATE_CONFIG_REFUSAL.replace('{message}', () => error.message) }
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

/** Every `--declare <path>` of the command line. */
function declaredPaths(argv: readonly string[]): string[] {
	return argv.flatMap((argument, index) =>
		argument === '--declare' && argv[index + 1] ? [argv[index + 1]] : [],
	)
}

function notRun(step: GateStep): StepResult {
	return { step, status: 'not-run', counts: {}, restored: [] }
}
