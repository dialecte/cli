/**
 * `dialecte gate [--fast | --full] [--base <ref>] [--no-wait] [--declare <path>]... [--json]` - the Definition of Done
 * of the package, inside its repository: `--fast` (default) while iterating, `--full` once per lot. Steps
 * come from `"dialecte": { "gate": { "fast", "full" } }` in package.json, or the defaults. One line per
 * step with the counts the step itself printed. While a hand-over script holds the repository it runs only
 * under the hand-over written for this repository (its lots file names it) when no real run of it is in
 * progress, and says so in one line; it refuses otherwise.
 *
 * `--fast` starts with the hygiene of the worktree (nothing staged, the stash as it was when the worktree
 * was made, new files declared). `--full`, and every heavy step, hold the machine-wide lock: one heavy run
 * at a time on a machine; a second one waits (a line every 30 s naming the holder) or, with `--no-wait`,
 * refuses. The `tdd` step measures the lot from HEAD (the uncommitted work); `--base <ref>` and `--full`
 * (before a merge) measure the whole branch.
 *
 * A run that reaches its steps records them in the worktree's git folder (`dialecte-gate-<mode>.json`),
 * for the hand-over card, with the key of what it checked: the tree, what npm installed, the steps, the
 * `file:` dependencies' folders. A run whose steps ran also goes to the repository's store of records by
 * tree, which every worktree of the repository reads. A green record of the same mode and key answers the
 * steps instead of running them (`--rerun` runs them whatever the store holds); the hygiene and the `tdd`
 * step, which are about the worktree and not the tree, run every time.
 */
import { join, resolve } from 'node:path'

import { getArg, hasFlag } from '../lib/config.ts'
import { computeCheckKey, gateCommandHash } from '../lib/gate-records/check-key.ts'
import { findReusableRecord, isSameKey, originOfRecord } from '../lib/gate-records/check-store.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { recordGate } from '../lib/gate-records/gate-records.ts'
import {
	GATE_REUSED_LINE,
	GATE_REUSED_VERDICT,
	GATE_STATE_CHANGED_LINE,
	STEP_DETAIL_INDENT,
} from '../lib/gate/gate-config.constants.ts'
import { resolveGateSteps } from '../lib/gate/gate-config.ts'
import { runGateSteps, runsTestsInABrowser } from '../lib/gate/run-gate.ts'
import { renderStepCounts } from '../lib/gate/step-counts.ts'
import { readHandoverHold } from '../lib/handover/handover-lock.ts'
import { GATE_UNDER_HANDOVER, HANDOVER_FILES } from '../lib/handover/handover.constants.ts'
import {
	acquireMachineLock,
	describeHolder,
	machineLockPath,
} from '../lib/machine-lock/machine-lock.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { openProcessLiveOutput } from '../lib/progress/process-live-output.ts'
import { createStepProgress } from '../lib/progress/step-progress.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { TDD_STEP } from '../lib/tdd/tdd.constants.ts'
import { checkHygiene } from '../lib/worktree/hygiene.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { CheckKey, GateRecord, RecordedStep } from '../lib/gate-records/gate-records.types.ts'
import type { GateStep } from '../lib/gate/gate-config.types.ts'
import type { GateMode, StepLock, StepResult } from '../lib/gate/gate.types.ts'
import type { MachineLockAccess, MachineLockTaken } from '../lib/machine-lock/machine-lock.types.ts'
import type { PackageJson } from '../lib/package-json.types.ts'
import type { LiveOutput, RunningStep } from '../lib/progress/step-progress.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = await runGate({
		cwd: process.cwd(),
		argv,
		...(!hasFlag(argv, 'json') && { live: openProcessLiveOutput() }),
	})
	console.log(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export async function runGate(params: {
	cwd: string
	argv: string[]
	/** Where each step's start line (or spinner) goes while it runs; the result is returned at the end. */
	live?: LiveOutput
	/** The machine lock: its file, the clock it waits with, where its waiting lines go. */
	machineLock?: MachineLockAccess
}): Promise<CommandResult> {
	const { cwd, argv } = params
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
	const machineLock = params.machineLock ?? {
		path: machineLockPath(),
		clock: createSystemClock(),
		write: (line: string) => console.error(line),
	}
	function lockFor(command: string): MachineLockTaken {
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
	const gateLock = mode === 'full' ? lockFor(`dialecte gate --full in ${resolve(cwd)}`) : undefined
	if (gateLock && 'refusal' in gateLock)
		results.push({
			step: { name: 'machine lock', run: '' },
			status: 'failed',
			counts: {},
			restored: [],
			reason: gateLock.refusal,
		})
	// what every step runs under while the gate holds the lock (`--full`)
	const heldHolderVariable =
		gateLock && !('refusal' in gateLock) ? gateLock.holderVariable : undefined
	try {
		if (results.some((result) => result.status === 'failed')) results.push(notRun(TDD_STEP))
		else {
			const running = progress?.start({ name: TDD_STEP.name, detail: 'the receipts of the change' })
			const tdd = await tddStep({
				cwd,
				packageJson,
				ref: getArg(argv, 'base'),
				wholeBranch: mode === 'full',
				lock: () =>
					runsTestsInABrowser({ root: cwd, packageJson })
						? lockFor(`dialecte gate --${mode} (tdd) in ${resolve(cwd)}`)
						: { release: () => undefined, holderVariable: heldHolderVariable },
			})
			results.push(tdd)
			if (running) showLive({ result: tdd, running })
		}
		// the key of the state the steps start on: a record is stored only when they leave it the same
		keyBefore = results.some((result) => result.status === 'failed')
			? undefined
			: computeCheckKey({ root: cwd, commandHash })
		const found =
			keyBefore && !hasFlag(argv, 'rerun')
				? findReusableRecord({ root: cwd, mode, key: keyBefore })
				: undefined
		reused = found && keyBefore && { record: found, key: keyBefore }
		if (results.some((result) => result.status === 'failed')) results.push(...steps.map(notRun))
		else if (reused) {
			if (progress) live?.writeLine(renderReuseLine({ mode, record: reused.record }))
			for (const result of reusedResults({ record: reused.record, steps })) {
				results.push(result)
				if (progress) showLive({ result })
			}
		} else {
			const stepResults = await runGateSteps({
				root: cwd,
				steps,
				packageJson,
				lockStep,
				heldHolderVariable,
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
	} finally {
		if (gateLock && !('refusal' in gateLock)) gateLock.release()
	}
	const original = reused && originOfRecord(reused.record)
	const keyAfter = reused?.key ?? computeCheckKey({ root: cwd, commandHash })
	// a state changed while the steps ran (a step edited a file, an install, a rebuilt dependency) was not
	// the state they checked: the run is recorded without a key, never stored
	const changedTree =
		keyBefore !== undefined && !isSameKey({ key: keyBefore, other: keyAfter })
			? keyBefore.tree
			: undefined
	const changedWhileRunning = changedTree !== undefined
	const stored = recordGate({
		root: cwd,
		mode,
		results,
		// without a key the record holds the tree its steps started on: never current for the one they left
		...(changedTree === undefined ? { key: keyAfter } : { checkedTree: changedTree }),
		...(original && { reused: original }),
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
	const reuseLine = reused && renderReuseLine({ mode, record: reused.record })
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

/** `reused: gate --<mode> green on this tree at <time> (HEAD <short>)`, naming the run that checked. */
function renderReuseLine(params: { mode: GateMode; record: GateRecord }): string {
	const { at, head } = originOfRecord(params.record)
	return GATE_REUSED_LINE.replace('{mode}', params.mode)
		.replace('{at}', at)
		.replace('{head}', head.slice(0, SHORT_SHA_LENGTH))
}

/** The configured steps as the reused record holds them (its tdd step left out: this run made its own). */
function reusedResults(params: { record: GateRecord; steps: readonly GateStep[] }): StepResult[] {
	return params.record.steps
		.filter((step) => step.name !== TDD_STEP.name)
		.map(function resultOf(recorded: RecordedStep): StepResult {
			return {
				step: params.steps.find((step) => step.name === recorded.name) ?? {
					name: recorded.name,
					run: '',
				},
				status: recorded.status,
				counts: recorded.counts,
				restored: [],
				...(recorded.note && { note: recorded.note }),
				...(recorded.reason && { reason: recorded.reason }),
			}
		})
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
	lock: () => MachineLockTaken
	ref: string | undefined
	wholeBranch: boolean
}): Promise<StepResult> {
	const check = await checkTddReceipts({
		root: params.cwd,
		packageJson: params.packageJson,
		lock: params.lock,
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
