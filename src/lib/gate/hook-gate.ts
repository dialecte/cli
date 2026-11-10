/**
 * `gate --hook`: the full gate's test steps for the commit being made, answered by a green `--full` record of its
 * key, else by a green `--release` record of its key when the release list covers `full`, else run. When the full
 * steps hold a scoped step, the hook base is resolved once (the hand-over base, else the base branch's merge-base,
 * else the empty tree) and enters the key; when a test step is scoped, it also reaches the scoped steps, and the
 * hook says the base it used and what was selected on one line.
 */
import { hasFlag } from '../config.ts'
import { partsOf, startStep } from '../events/record-step.ts'
import { computeCommitKey } from '../gate-records/check-key.ts'
import { findReusableRecord, originOfRecord } from '../gate-records/check-store.ts'
import { RELEASE_RECORD_MODE, SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { readModeCommandHashes } from '../gate-records/mode-command-hashes.ts'
import { reusedResults } from '../gate-records/record-reuse.ts'
import { readPackageJson } from '../package-json.ts'
import { createStepProgress } from '../progress/step-progress.ts'
import { createSystemClock } from '../progress/system-clock.ts'
import { resolveGateBase } from './gate-base.ts'
import {
	GATE_HOOK_BASE_LINE,
	GATE_HOOK_FAILED_LINE,
	GATE_HOOK_GREEN_LINE,
	GATE_HOOK_ID_SEPARATOR,
	GATE_HOOK_LINE_PREFIX,
	GATE_HOOK_NO_TEST_STEP_LINE,
	GATE_HOOK_RELEASE_REUSED_LINE,
	GATE_HOOK_REUSED_LINE,
	GATE_HOOK_RUNNING_LINE,
	GATE_HOOK_SELECTION_WORDS,
	STEP_DETAIL_INDENT,
} from './gate-config.constants.ts'
import { holdsScopedStep, listHookTestSteps, resolveGateSteps } from './gate-config.ts'
import { runGateSteps } from './run-gate.ts'
import { renderVitestTestsLine, sumStepCounts } from './step-counts.ts'
import { renderStepLine } from './step-line.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { CheckKey, GateRecord } from '../gate-records/gate-records.types.ts'
import type { ModeCommandHashes } from '../gate-records/mode-command-hashes.types.ts'
import type { LiveOutput } from '../progress/step-progress.types.ts'
import type { GateRunBase, HandoverBase, UsedGateBase } from './gate-base.types.ts'
import type { StepResult } from './gate.types.ts'

/**
 * `gate --hook` in the worktree `cwd`: the line saying which record answered, or the test steps run (their lines,
 * one vitest summary line of their summed counts, then the verdict). With a scoped test step, the lines about the
 * base (a hand-over variable given alone, a hand-over base ignored, the note of rule 4) come first and the base line
 * before the verdict. Throws a `GateConfigError` for a gate config the cli cannot run.
 */
export async function runHookGate(params: {
	cwd: string
	argv: string[]
	/** The index file git handed the commit hook (relative: to the worktree top); default: the worktree's own index. */
	indexFile: string | undefined
	/** False when what is committed is unknown (git variables naming another repository): the tests run. */
	reusable: boolean
	live: LiveOutput | undefined
	/** The base a hand-over run handed down. */
	handoverBase: HandoverBase | undefined
	/** Why a hand-over variable given without the other was ignored. */
	handoverIgnored: string | undefined
	/** Where the one `events: not recorded: <reason>` line goes (standard error unless given). */
	warn?: (line: string) => void
}): Promise<CommandResult> {
	const { cwd } = params
	const packageJson = readPackageJson(cwd)
	const fullSteps = resolveGateSteps({ packageJson, mode: 'full' })
	const testSteps = listHookTestSteps(fullSteps)
	if (testSteps.length === 0) return { exitCode: 0, output: GATE_HOOK_NO_TEST_STEP_LINE }
	// the full gate's key holds its base whenever a full step is scoped; the hook says it only when it runs one
	const hookBase = holdsScopedStep(fullSteps)
		? resolveHookBase({
				cwd,
				handoverBase: params.handoverBase,
				handoverIgnored: params.handoverIgnored,
			})
		: undefined
	const shown = holdsScopedStep(testSteps) ? hookBase : undefined
	const hashes = readModeCommandHashes({ root: cwd, packageJson, gateBase: hookBase?.base.commit })
	const key = computeCommitKey({
		root: cwd,
		commandHash: hashes.full,
		...(params.indexFile && { indexFile: params.indexFile }),
	})
	const baseLines = shown?.lines ?? []
	// the run's events: a hook answered from a record is a run too (reuse whole)
	const recorder = startStep({ cwd, step: 'gate-hook', heavy: false, warn: params.warn })
	const reuse =
		!params.reusable || hasFlag(params.argv, 'no-reuse')
			? undefined
			: findHookReuse({ cwd, key, hashes })
	if (reuse) {
		const testNames = testSteps.map(function nameOf(step) {
			return step.name
		})
		const answered = reusedResults({ record: reuse.record, steps: testSteps }).filter(
			function isTestStep(result) {
				return testNames.includes(result.step.name)
			},
		)
		recorder.end({
			exit: 0,
			parts: partsOf({ results: answered, durations: new Map(), reused: new Set(answered) }),
			reuse: 'whole',
			stateHash: null,
		})
		return {
			exitCode: 0,
			output: [
				...baseLines,
				reuse.line,
				...(shown
					? [renderHookBaseLine({ base: shown.base, selection: GATE_HOOK_SELECTION_WORDS.reused })]
					: []),
			].join('\n'),
		}
	}
	const runningLine = GATE_HOOK_RUNNING_LINE.replace('{tree}', key.tree.slice(0, SHORT_SHA_LENGTH))
	const { live } = params
	const progress = live ? createStepProgress({ live, clock: createSystemClock() }) : undefined
	// off a terminal the result holds them: each said once
	if (live?.tty) for (const line of baseLines) live.writeLine(line)
	live?.writeLine(runningLine)
	const durations = new Map<StepResult, number>()
	const results = await runGateSteps({
		root: cwd,
		steps: testSteps,
		packageJson,
		// the scoped steps select on the tree the commit records, against the hook base
		...(shown && { scope: { base: shown.base.commit, tree: key.tree } }),
		// always: the run's events time each part, progress shown or not (D8)
		announce: function announce(step) {
			const finishPart = recorder.startPart({ name: step.name, heavy: step.heavy === true })
			const running = progress?.start({ name: step.name, detail: step.run })
			return function finished(result) {
				durations.set(result, finishPart())
				running?.finish(...hookStepLines(result))
			}
		},
	})
	const failed = results.find((result) => result.status === 'failed')
	// the hook stores no record: no state hash
	recorder.end({
		exit: failed ? 1 : 0,
		parts: partsOf({ results, durations, reused: new Set() }),
		reuse: 'none',
		stateHash: null,
	})
	// one line for every step: a hook's reader reads the last summary line of the hook's step
	const summary = renderVitestTestsLine(sumStepCounts(results.map((result) => result.counts)))
	if (summary && live?.tty) live.writeLine(summary)
	const baseLine = shown
		? renderHookBaseLine({ base: shown.base, selection: selectionWords(results) })
		: undefined
	if (baseLine && live?.tty) live.writeLine(baseLine)
	return {
		exitCode: failed ? 1 : 0,
		output: [
			// on a terminal the lines are on the screen already
			...(live?.tty ? [] : [...baseLines, runningLine, ...results.flatMap(hookStepLines)]),
			...(summary && !live?.tty ? [summary] : []),
			...(baseLine && !live?.tty ? [baseLine] : []),
			failed ? GATE_HOOK_FAILED_LINE.replace('{step}', failed.step.name) : GATE_HOOK_GREEN_LINE,
			...(failed?.tail ? [`--- last lines of ${failed.step.name} ---`, failed.tail] : []),
		].join('\n'),
	}
}

/**
 * The hook base, resolved once (`resolveGateBase` with the hand-over base, never a `--base` ref), with the lines
 * said before the steps: a hand-over variable given alone, a hand-over base ignored and why, the note of rule 4.
 */
function resolveHookBase(params: {
	cwd: string
	handoverBase: HandoverBase | undefined
	handoverIgnored: string | undefined
}): GateRunBase {
	const resolved = resolveGateBase({
		root: params.cwd,
		...(params.handoverBase && { handoverBase: params.handoverBase }),
	})
	// only a `--base` ref is refused, and a hook has none
	if ('refusal' in resolved) throw new Error(resolved.refusal)
	return {
		base: { commit: resolved.commit, source: resolved.source },
		lines: [params.handoverIgnored, resolved.ignored, resolved.note].flatMap((line) =>
			line === undefined ? [] : [`${GATE_HOOK_LINE_PREFIX}${line}`],
		),
	}
}

/**
 * The green record answering the hook's key, with its line: a `--full` record of it, else a `--release` record of
 * the same tree and install with the release command hash when the release list covers `full`; undefined when none
 * answers.
 */
function findHookReuse(params: {
	cwd: string
	key: CheckKey
	hashes: ModeCommandHashes
}): { line: string; record: GateRecord } | undefined {
	const { cwd, key, hashes } = params
	const full = findReusableRecord({ root: cwd, mode: 'full', key })
	if (full)
		return {
			line: renderHookReuseLine({ template: GATE_HOOK_REUSED_LINE, key, record: full }),
			record: full,
		}
	if (!hashes.releaseCoversFull) return undefined
	const release = findReusableRecord({
		root: cwd,
		mode: RELEASE_RECORD_MODE,
		key: { ...key, commandHash: hashes.release },
	})
	return release
		? {
				line: renderHookReuseLine({
					template: GATE_HOOK_RELEASE_REUSED_LINE,
					key,
					record: release,
				}),
				record: release,
			}
		: undefined
}

/** A hook's reuse line: the committed tree, then the time and the short HEAD of the run the record answers for. */
function renderHookReuseLine(params: {
	template: string
	key: CheckKey
	record: GateRecord
}): string {
	const { at, head } = originOfRecord(params.record)
	return params.template
		.replace('{tree}', params.key.tree.slice(0, SHORT_SHA_LENGTH))
		.replace('{at}', at)
		.replace('{head}', head.slice(0, SHORT_SHA_LENGTH))
}

/** The hook's base line: the full sha, its source, then `selection`. */
function renderHookBaseLine(params: { base: UsedGateBase; selection: string }): string {
	return GATE_HOOK_BASE_LINE.replace('{commit}', params.base.commit)
		.replace('{source}', params.base.source)
		.replace('{selection}', params.selection)
}

/**
 * What the scoped steps that ran selected: `no valid selection` when one failed without a valid selection, else
 * every id once in the order first selected, else `nothing selected`.
 */
function selectionWords(results: readonly StepResult[]): string {
	if (
		results.some(
			(result) =>
				result.step.scoped === true && result.status === 'failed' && result.selection === undefined,
		)
	)
		return GATE_HOOK_SELECTION_WORDS.invalid
	const ids = [...new Set(results.flatMap((result) => result.selection?.ids ?? []))]
	return ids.length
		? GATE_HOOK_SELECTION_WORDS.selected.replace('{ids}', ids.join(GATE_HOOK_ID_SEPARATOR))
		: GATE_HOOK_SELECTION_WORDS.nothing
}

/** A test step `gate --hook` ran: its line and the lines under it (the files a rerun named). */
function hookStepLines(result: StepResult): string[] {
	return [
		renderStepLine(result),
		...(result.details ?? []).map((line) => `${STEP_DETAIL_INDENT}${line}`),
	]
}
