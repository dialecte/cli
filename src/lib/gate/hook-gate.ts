/**
 * `gate --hook`: the full gate's hook steps (all but the scoped ones that count no tests) for the commit being made,
 * each answered by the newest green record of the committed tree and install that ran it as it is now (any mode),
 * else run - every step not answered in one run, in list order. When the full steps hold a scoped step, the hook
 * base is resolved once (the hand-over base, else the base branch's merge-base, else the empty tree) and enters a
 * scoped step's hash; when a hook step is scoped, it also reaches the scoped steps, and the hook says the base it
 * used and what was selected on one line. Every run with a HEAD records itself (mode `hook-gate`), unless a step ran
 * while the working files were not the committed tree (before or after it): a step reads the working files.
 */
import { hasFlag } from '../config.ts'
import { partsOf, reuseOf, startStep } from '../events/record-step.ts'
import { hashGateCommand, readIndexTree, readInstalledKey } from '../gate-records/check-key.ts'
import { HOOK_GATE_RECORD_MODE, SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { recordGate } from '../gate-records/gate-records.ts'
import { readModeCommandHashes } from '../gate-records/mode-command-hashes.ts'
import { GATE_NO_HEAD_LINE } from '../gate-records/no-head.constants.ts'
import { computeStateTree } from '../gate-records/state-hash.ts'
import { hashGateStep } from '../gate-records/step-reuse.ts'
import { readHeadOrNone } from '../git.ts'
import { joinedOf, textOf } from '../print/print.ts'
import { childLinesOf, relayedTextOf } from '../print/relayed.ts'
import { createStepProgress } from '../progress/step-progress.ts'
import { createSystemClock } from '../progress/system-clock.ts'
import { readEmptyTree, resolveGateBase } from './gate-base.ts'
import {
	GATE_HOOK_BASE_LINE,
	GATE_HOOK_FAILED_LINE,
	GATE_HOOK_GREEN_LINE,
	GATE_HOOK_ID_SEPARATOR,
	GATE_HOOK_LINE_PREFIX,
	GATE_HOOK_NO_STEP_LINE,
	GATE_HOOK_RUNNING_LINE,
	GATE_HOOK_SELECTION_WORDS,
	STEP_DETAIL_INDENT,
} from './gate-config.constants.ts'
import { GateConfigError, holdsScopedStep, listHookSteps, resolveGateSteps } from './gate-config.ts'
import { answerHookSteps } from './hook-step-answers.ts'
import { runGateSteps } from './run-gate.ts'
import { renderVitestTestsLine, sumStepCounts } from './step-counts.ts'
import { renderStepLine } from './step-line.ts'
import { readStepSource } from './step-source.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { StepHandle } from '../events/record-step.types.ts'
import type { CheckKey, RecordOrigin } from '../gate-records/gate-records.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type { LiveOutput } from '../progress/step-progress.types.ts'
import type { Refusal } from '../refusal.types.ts'
import type { GateRunBase, HandoverBase, UsedGateBase } from './gate-base.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { StepResult } from './gate.types.ts'
import type { HookAnswers, PreparedHookRun } from './hook-gate.types.ts'

/**
 * `gate --hook` in the worktree `cwd`. Every step answered: one reused line per step naming the run that really ran
 * it. Nothing answered: the running line, the steps' lines, one vitest summary line of their summed counts, then the
 * verdict. Some answered: their reused lines, then the lines of the steps run, then the verdict. With a scoped hook
 * step, the lines about the base (a hand-over variable given alone, a hand-over base ignored, the note of rule 4)
 * come first and the base line before the verdict. Throws a `GateConfigError` for a gate config the cli cannot
 * run; a set `dialecte.baseBranch` naming no branch fails (exit 1) with its refusal, no step run.
 */
export async function runHookGate(params: {
	cwd: string
	argv: string[]
	/** The index file git handed the commit hook (relative: to the worktree top); default: the worktree's own index. */
	indexFile: string | undefined
	/** False when what is committed is unknown (git variables naming another repository): every step runs. */
	reusable: boolean
	live: LiveOutput | undefined
	/** The base a hand-over run handed down. */
	handoverBase: HandoverBase | undefined
	/** Why a hand-over variable given without the other was ignored. */
	handoverIgnored: string | undefined
	/** The absolute git common dir whose store the hook reads and writes (a rehearsal clone's); its records are a rehearsal's. */
	checkStore?: string
	/** The line saying why a given store was ignored: the hook's first line. */
	checkStoreIgnored?: string
	/** Where the one `events: not recorded: <reason>` line goes (standard error unless given). */
	warn?: (line: string) => void
}): Promise<CommandResult> {
	const notices = params.checkStoreIgnored ? [params.checkStoreIgnored] : []
	const prepared = prepareHookRun(params)
	if ('result' in prepared) return withNotices({ result: prepared.result, notices })
	const { hookSteps, shown, tree } = prepared
	// the run's events: a hook answered from records is a run too
	const recorder = startStep({
		cwd: params.cwd,
		step: 'gate-hook',
		heavy: false,
		warn: params.warn,
	})
	const answers = findHookAnswers({
		cwd: params.cwd,
		prepared,
		reusable: params.reusable && !hasFlag(params.argv, 'no-reuse'),
		checkStore: params.checkStore,
	})
	const recordOf = {
		cwd: params.cwd,
		recorder,
		hasHead: prepared.hasHead,
		key: {
			tree,
			...prepared.installed,
			commandHash: hashGateCommand({ steps: hookSteps, gateBase: prepared.gateBase }),
		},
		steps: hookSteps,
		stepHashes: prepared.stepHashes,
		answers,
		checkStore: params.checkStore,
	}
	const baseLines = shown?.lines ?? []
	const toRun = hookSteps.filter((step) => !answers.origins.has(step.name))
	if (toRun.length === 0) {
		endHookRun({ ...recordOf, ran: [], durations: new Map(), ranOnTree: true })
		return renderAnsweredOutput({ notices, baseLines, answers, base: shown?.base })
	}
	const { live } = params
	const leading = showLeadingLines({ notices, baseLines, answers, tree, steps: toRun, live })
	const {
		results: ran,
		durations,
		ranOnTree,
	} = await runHookSteps({
		cwd: params.cwd,
		committedTree: prepared.hasHead ? tree : undefined,
		steps: toRun,
		packageJson: prepared.packageJson,
		live,
		recorder,
		// the scoped steps select on the tree the commit records, against the hook base
		...(shown && { scope: { base: shown.base.commit, tree } }),
	})
	endHookRun({ ...recordOf, ran, durations, ranOnTree })
	return renderRunOutput({
		ran,
		live,
		leading,
		base: shown?.base,
		headLines: prepared.hasHead ? [] : [GATE_NO_HEAD_LINE.replace('{command}', 'gate --hook')],
	})
}

/**
 * The lines before the steps a hook runs: the notices (a given store ignored), the base lines, the reused lines, and
 * the running line when nothing was answered. On a terminal they are written now, before the steps; else the notices
 * and the running line alone go live.
 */
function showLeadingLines(params: {
	notices: readonly string[]
	baseLines: readonly string[]
	answers: HookAnswers
	tree: string
	/** The steps the hook runs, in list order: the running line names them. */
	steps: readonly GateStep[]
	live: LiveOutput | undefined
}): string[] {
	const { answers, live } = params
	const running =
		answers.lines.length === 0
			? GATE_HOOK_RUNNING_LINE.replace('{tree}', params.tree.slice(0, SHORT_SHA_LENGTH)).replace(
					'{steps}',
					() => params.steps.map((step) => step.name).join(GATE_HOOK_ID_SEPARATOR),
				)
			: undefined
	const leading = [
		...params.notices,
		...params.baseLines,
		...answers.lines,
		...(running ? [running] : []),
	]
	const shownNow = live?.tty ? leading : [...params.notices, ...(running ? [running] : [])]
	if (live) for (const line of shownNow) live.writeLine(textOf([line]))
	return leading
}

/**
 * The hook steps the records answer (with a HEAD and a reusable run only: `--no-reuse`, or git variables naming
 * another repository, answer nothing), read in the given store, else the repository's.
 */
function findHookAnswers(params: {
	cwd: string
	prepared: PreparedHookRun
	reusable: boolean
	checkStore: string | undefined
}): HookAnswers {
	const { cwd, prepared } = params
	if (!prepared.hasHead || !params.reusable)
		return { results: [], origins: new Map<string, RecordOrigin>(), lines: [] }
	const hashes = readModeCommandHashes({
		root: cwd,
		packageJson: prepared.packageJson,
		gateBase: prepared.gateBase,
	})
	return answerHookSteps({
		cwd,
		tree: prepared.tree,
		installed: prepared.installed,
		checkStore: params.checkStore,
		steps: prepared.hookSteps,
		stepHashes: prepared.stepHashes,
		emptyTree: readEmptyTree(cwd),
		hashes,
	})
}

/**
 * What a hook run starts from: the hook steps of the full list, the hook base (resolved once when a full step is
 * scoped; shown when a hook step is), whether there is a HEAD, the committed tree, the install and each step's
 * hash at the hook base. A result instead when the hook ends before any step: no hook step, or a refused base.
 */
function prepareHookRun(params: {
	cwd: string
	indexFile: string | undefined
	handoverBase: HandoverBase | undefined
	handoverIgnored: string | undefined
}): PreparedHookRun | { result: CommandResult } {
	const { cwd } = params
	// nothing to run without a package.json stops the commit, as a broken gate config does
	const source = readStepSource(cwd)
	if ('refusal' in source) throw new GateConfigError(source.refusal)
	const { packageJson } = source
	const fullSteps = resolveGateSteps({ packageJson, mode: 'full' })
	const hookSteps = listHookSteps(fullSteps)
	if (hookSteps.length === 0)
		return { result: { exitCode: 0, output: textOf([GATE_HOOK_NO_STEP_LINE]) } }
	// a scoped full step's hash holds the base; the hook says it only when it runs a scoped step
	const hookBase = holdsScopedStep(fullSteps)
		? resolveHookBase({
				cwd,
				handoverBase: params.handoverBase,
				handoverIgnored: params.handoverIgnored,
			})
		: undefined
	// a set dialecte.baseBranch naming no branch: the commit fails with the refusal, no step run
	if (hookBase !== undefined && 'refusal' in hookBase)
		return { result: { exitCode: 1, output: textOf([hookBase.refusal]) } }
	const gateBase = hookBase?.base.commit
	return {
		packageJson,
		hookSteps,
		shown: holdsScopedStep(hookSteps) ? hookBase : undefined,
		gateBase,
		// a record is keyed on HEAD: a repository with no commit yet has none to answer and keeps none
		hasHead: readHeadOrNone(cwd) !== undefined,
		tree: readIndexTree({ root: cwd, ...(params.indexFile && { indexFile: params.indexFile }) }),
		installed: readInstalledKey(cwd),
		stepHashes: new Map(
			hookSteps.map((step) => [step.name, hashGateStep({ root: cwd, step, gateBase })]),
		),
	}
}

/**
 * The output of a hook whose every step a record answered: the notices, the base lines, one reused line per step, and
 * the base line saying `reused` when a hook step is scoped.
 */
function renderAnsweredOutput(params: {
	notices: readonly string[]
	baseLines: readonly string[]
	answers: HookAnswers
	base: UsedGateBase | undefined
}): CommandResult {
	const { base } = params
	const baseLine = base && renderHookBaseLine({ base, selection: GATE_HOOK_SELECTION_WORDS.reused })
	return {
		exitCode: 0,
		output: textOf([
			...params.notices,
			...params.baseLines,
			...params.answers.lines,
			...(baseLine ? [baseLine] : []),
		]),
	}
}

/** `result` with the notices (a given store ignored) before its lines. */
function withNotices(params: { result: CommandResult; notices: readonly string[] }): CommandResult {
	const { result, notices } = params
	return notices.length ? { ...result, output: joinedOf([textOf(notices), result.output]) } : result
}

/**
 * The steps not answered, in one run, in list order, with how long each took: each part timed for the run's events,
 * its line shown live. The steps read the working files: `ranOnTree` says whether those were the committed tree
 * before the steps and after (false with no committed tree to compare: no HEAD, no record kept).
 */
async function runHookSteps(params: {
	cwd: string
	/** The tree the commit records; undefined with no HEAD. */
	committedTree: string | undefined
	steps: GateStep[]
	packageJson: PackageJson
	live: LiveOutput | undefined
	recorder: StepHandle
	scope?: { base: string; tree: string }
}): Promise<{
	results: StepResult[]
	durations: ReadonlyMap<StepResult, number>
	ranOnTree: boolean
}> {
	const { recorder, live, committedTree } = params
	const treeBefore = committedTree && computeStateTree(params.cwd)
	const progress = live ? createStepProgress({ live, clock: createSystemClock() }) : undefined
	const durations = new Map<StepResult, number>()
	const results = await runGateSteps({
		root: params.cwd,
		steps: params.steps,
		packageJson: params.packageJson,
		...(params.scope && { scope: params.scope }),
		// always: the run's events time each part, progress shown or not (D8)
		announce: function announce(step) {
			const finishPart = recorder.startPart({ name: step.name, heavy: step.heavy === true })
			const running = progress?.start({ name: step.name, detail: step.run })
			return function finished(result) {
				durations.set(result, finishPart())
				running?.finish(...hookStepLines(result).map((line) => textOf([line])))
			}
		},
	})
	const ranOnTree =
		committedTree !== undefined &&
		treeBefore === committedTree &&
		computeStateTree(params.cwd) === committedTree
	return { results, durations, ranOnTree }
}

/**
 * Records the hook's run (mode `hook-gate`, with a HEAD only): every hook step in list order with its step hash, an
 * answered one with the run that really ran it; stored in the given store as a rehearsal's, else the repository's.
 * No record when a step ran on working files other than the committed tree (`ranOnTree` false). Then ends the run's events with the parts the records answered, and the record's state hash when a step ran.
 */
function endHookRun(params: {
	cwd: string
	recorder: StepHandle
	hasHead: boolean
	key: CheckKey
	steps: readonly GateStep[]
	stepHashes: ReadonlyMap<string, string>
	answers: HookAnswers
	ran: readonly StepResult[]
	durations: ReadonlyMap<StepResult, number>
	checkStore: string | undefined
	/** The working files were the committed tree before the steps ran and after (true when no step ran). */
	ranOnTree: boolean
}): void {
	const { answers, ran } = params
	const results = params.steps.flatMap((step) =>
		[...answers.results, ...ran].filter((result) => result.step.name === step.name),
	)
	const recorded =
		params.hasHead && params.ranOnTree
			? recordGate({
					root: params.cwd,
					mode: HOOK_GATE_RECORD_MODE,
					results,
					key: params.key,
					stepHashes: params.stepHashes,
					stepOrigins: answers.origins,
					...(params.checkStore && { checkStore: params.checkStore }),
				})
			: undefined
	const parts = partsOf({
		results,
		durations: new Map(params.durations),
		reused: new Set(answers.results),
	})
	params.recorder.end({
		exit: ran.some((result) => result.status === 'failed') ? 1 : 0,
		parts,
		reuse: reuseOf(parts),
		// a run every record answered checked nothing of the tree itself: no state hash, as a whole reuse never had
		stateHash: ran.length > 0 ? (recorded?.stateHash ?? null) : null,
		// the key of the record this run stored; none when it stored nothing
		...(recorded?.stored && { key: params.key }),
	})
}

/**
 * The output of a hook that ran steps: off a terminal the leading lines and the steps' lines (on a terminal they are
 * on the screen already), the summary, the base line, the no-HEAD line, the verdict, and a failed step's last lines.
 */
function renderRunOutput(params: {
	ran: readonly StepResult[]
	live: LiveOutput | undefined
	leading: readonly string[]
	base: UsedGateBase | undefined
	headLines: readonly string[]
}): CommandResult {
	const { ran, live, base } = params
	const failed = ran.find((result) => result.status === 'failed')
	// one line for every step: a hook's reader reads the last summary line of the hook's step
	const summary = renderVitestTestsLine(sumStepCounts(ran.map((result) => result.counts)))
	if (summary && live?.tty) live.writeLine(summary)
	const baseLine = base
		? renderHookBaseLine({
				base,
				selection: ran.some((result) => result.step.scoped === true)
					? selectionWords(ran)
					: GATE_HOOK_SELECTION_WORDS.reused,
			})
		: undefined
	if (baseLine && live?.tty) live.writeLine(baseLine)
	const own = textOf([
		// on a terminal the lines are on the screen already
		...(live?.tty ? [] : [...params.leading, ...ran.flatMap(hookStepLines)]),
		...(summary && !live?.tty ? [summary] : []),
		...(baseLine && !live?.tty ? [baseLine] : []),
		...params.headLines,
		failed ? GATE_HOOK_FAILED_LINE.replace('{step}', failed.step.name) : GATE_HOOK_GREEN_LINE,
		...(failed?.tail ? [`--- last lines of ${failed.step.name} ---`] : []),
	])
	return {
		exitCode: failed ? 1 : 0,
		// the failed step's last lines are its own output, relayed line by line
		output: failed?.tail ? joinedOf([own, relayedTextOf(childLinesOf(failed.tail))]) : own,
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
}): GateRunBase | Refusal {
	const resolved = resolveGateBase({
		root: params.cwd,
		...(params.handoverBase && { handoverBase: params.handoverBase }),
	})
	// a hook has no `--base` ref: only a set dialecte.baseBranch naming no branch is refused, never read as no base
	if ('refusal' in resolved) return resolved
	return {
		base: { commit: resolved.commit, source: resolved.source },
		lines: [params.handoverIgnored, resolved.ignored, resolved.note].flatMap((line) =>
			line === undefined ? [] : [`${GATE_HOOK_LINE_PREFIX}${line}`],
		),
	}
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
