/**
 * `gate --hook`: on a commit of a lot's branch, the scope step then the design step first (a failure runs no step);
 * with a declared `dialecte.gate.hook`, the tdd receipts of the lot first (`runHookTddStep`, run every
 * time, never recorded; a failure runs no step), then the declared steps; else every step of the full gate. For the
 * commit being made, each answered by the newest green record of the committed tree and install that ran it as it is
 * now (any mode), else run - every step not answered in one run, in list order. When the full steps hold a scoped step,
 * the hook base is resolved once (the hand-over base, else the base branch's merge-base, else the empty tree) and
 * enters a scoped step's hash; when a hook step is scoped, it also reaches the scoped steps, and the hook says the base
 * it used and what was selected on one line. Every run with a HEAD records itself (mode `hook-gate`), unless a step ran
 * while the working files were not the committed tree (before or after it): a step reads the working files.
 */
import { RELEASED_CHANGELOG_LINES } from '../changelog/changelog.constants.ts'
import { hasFlag } from '../config.ts'
import { partsOf, reuseOf, startStep } from '../events/record-step.ts'
import { hashHookGateCommand, readIndexTree, readTreeKey } from '../gate-records/check-key.ts'
import { HOOK_GATE_RECORD_MODE, SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { recordGate } from '../gate-records/gate-records.ts'
import { readModeCommandHashes } from '../gate-records/mode-command-hashes.ts'
import { GATE_NO_HEAD_LINE } from '../gate-records/no-head.constants.ts'
import { computeStateTree } from '../gate-records/state-hash.ts'
import { hashGateStep } from '../gate-records/step-reuse.ts'
import { readHeadOrNone } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { joinedOf, textOf } from '../print/print.ts'
import { childLinesOf, relayedTextOf } from '../print/relayed.ts'
import { createStepProgress } from '../progress/step-progress.ts'
import { createSystemClock } from '../progress/system-clock.ts'
import { verifiedCommitOf } from '../rules/released-changelog.ts'
import { TDD_STEP } from '../tdd/tdd.constants.ts'
import { checkInstallMatchesTree } from '../worktree/tree-install.ts'
import { FULL_OBJECT_ID_PATTERN } from './gate-base.constants.ts'
import { readEmptyTree, resolveGateBase } from './gate-base.ts'
import {
	GATE_FAILED_TAIL_LINE,
	GATE_HOOK_BASE_LINE,
	GATE_HOOK_FAILED_LINE,
	GATE_HOOK_GREEN_LINE,
	GATE_HOOK_ID_SEPARATOR,
	GATE_HOOK_LINE_PREFIX,
	GATE_HOOK_NO_STEP_LINE,
	GATE_HOOK_RUNNING_LINE,
	GATE_HOOK_SELECTION_WORDS,
} from './gate-config.constants.ts'
import {
	GateConfigError,
	holdsScopedStep,
	resolveGateSteps,
	resolveHookSteps,
} from './gate-config.ts'
import { hookLotOf, resolveHookLotBase, runHookDesignStep } from './hook-design.ts'
import { runHookScopeStep } from './hook-scope.ts'
import { answerHookSteps } from './hook-step-answers.ts'
import { HOOK_TDD_STEP_DETAIL } from './hook-tdd.constants.ts'
import { runHookTddStep } from './hook-tdd.ts'
import { runGateSteps } from './run-gate.ts'
import { renderVitestTestsLine, sumStepCounts } from './step-counts.ts'
import { renderStepLines } from './step-line.ts'
import { readStepSource } from './step-source.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { StepHandle } from '../events/record-step.types.ts'
import type { CheckKey, RecordOrigin } from '../gate-records/gate-records.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type { LiveOutput } from '../progress/step-progress.types.ts'
import type { Refusal } from '../refusal.types.ts'
import type { TddBase } from '../tdd/tdd.types.ts'
import type { GateRunBase, HandoverBase, UsedGateBase } from './gate-base.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { StepResult } from './gate.types.ts'
import type { HookLot } from './hook-design.types.ts'
import type {
	HookAnswers,
	HookGateParams,
	OwnHookSteps,
	PreparedHookRun,
} from './hook-gate.types.ts'

/**
 * `gate --hook` in the worktree `cwd`. On a commit of a lot's branch its guards come first, whatever the hook list
 * declares: the scope step, then the design step; a failed one stops the commit, its lines and the verdict alone. A
 * declared hook list's tdd step comes next: failed, its lines and the verdict
 * alone; else its line before the others. Every step answered: one reused line per step naming the run that really ran
 * it. Nothing answered: the running line, the steps' lines, one vitest summary line of their summed counts, then the
 * verdict. Some answered: their reused lines, then the lines of the steps run, then the verdict. With a scoped hook
 * step, the lines about the base (a hand-over variable given alone, a hand-over base ignored, the note of rule 4)
 * come first and the base line before the verdict. Throws a `GateConfigError` for a gate config the cli cannot
 * run; a set `dialecte.baseBranch` naming no branch fails (exit 1) with its refusal, no step run.
 */
export async function runHookGate(params: HookGateParams): Promise<CommandResult> {
	const notices = params.checkStoreIgnored ? [params.checkStoreIgnored] : []
	// a release base handed that names no full commit of the repository stops the commit before anything runs
	const releaseRefusal = releaseBaseRefusalOf({ cwd: params.cwd, releaseBase: params.releaseBase })
	if (releaseRefusal !== undefined)
		return withNotices({ result: { exitCode: 1, output: textOf([releaseRefusal]) }, notices })
	// the tree being committed, read once: the scope step holds it, the steps are keyed on it
	const tree = readIndexTree({
		root: params.cwd,
		...(params.indexFile && { indexFile: params.indexFile }),
	})
	// the lot being committed and its base, resolved once for the run: the scope, design and tdd steps read them (#57)
	const packageJson = readPackageJson(params.cwd)
	const lot = hookLotOf({ cwd: params.cwd })
	const base = resolveHookLotBase({ cwd: params.cwd, packageJson, lot })
	// the guards first, whatever the hook list declares: the scope step, then the design step; a refused one stops the
	// commit before any other step
	const guards = runHookGuards({ cwd: params.cwd, packageJson, lot, base, tree })
	if (guards.results.some((result) => result.status === 'failed'))
		return withNotices({ result: endFailedGuard({ params, guards, notices }), notices })
	const prepared = prepareHookRun({ ...params, tree })
	if ('result' in prepared) return withNotices({ result: prepared.result, notices })
	// a live output gets the notices first and every line once: what it printed is never in the result again
	if (params.live) for (const line of notices) params.live.writeLine(textOf([line]))
	// the run's events: a hook answered from records is a run too
	const recorder = startStep({
		cwd: params.cwd,
		step: 'gate-hook',
		heavy: false,
		warn: params.warn,
	})
	// a declared hook list (a package whose suite runs on CI) commits on the tdd receipts of the lot first
	const own = await runOwnHookSteps({
		cwd: params.cwd,
		prepared,
		live: params.live,
		recorder,
		base,
		guards,
	})
	if (own.results.some((result) => result.status === 'failed'))
		return endFailedOwnRun({ own, recorder, live: params.live, notices })
	return answerOrRunHookSteps({ params, prepared, recorder, own, notices })
}

/**
 * The declared (or default) hook steps after the hook's own: each answered by a record, else run; the run recorded,
 * its output rendered (`runHookGate`).
 */
async function answerOrRunHookSteps(args: {
	params: HookGateParams
	prepared: PreparedHookRun
	recorder: StepHandle
	own: OwnHookSteps
	notices: readonly string[]
}): Promise<CommandResult> {
	const { params, prepared, recorder, own, notices } = args
	const { hookSteps, shown, tree } = prepared
	const ownLines = own.results.flatMap(renderStepLines)
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
		key: { tree, ...prepared.treeKey, commandHash: hashHookGateCommand(prepared) },
		steps: hookSteps,
		stepHashes: prepared.stepHashes,
		answers,
		own,
		checkStore: params.checkStore,
	}
	const baseLines = shown?.lines ?? []
	const toRun = hookSteps.filter((step) => !answers.origins.has(step.name))
	if (toRun.length === 0) {
		endHookRun({ ...recordOf, ran: [], durations: new Map(), ranOnTree: true })
		return renderAnsweredOutput({
			// live, the notices and the own steps' lines are printed already
			notices: params.live ? [] : [...notices, ...ownLines],
			baseLines,
			answers,
			base: shown?.base,
		})
	}
	const { live } = params
	const leading = showLeadingLines({
		notices,
		ownLines,
		baseLines,
		answers,
		tree,
		steps: toRun,
		live,
	})
	const run = await runHookSteps({
		cwd: params.cwd,
		committedTree: prepared.hasHead ? tree : undefined,
		steps: toRun,
		packageJson: prepared.packageJson,
		live,
		recorder,
		// the scoped steps select on the tree the commit records, against the hook base
		...(shown && { scope: { base: shown.base.commit, tree } }),
		...(params.releaseBase !== undefined && { releaseBase: params.releaseBase }),
	})
	endHookRun({ ...recordOf, ran: run.results, durations: run.durations, ranOnTree: run.ranOnTree })
	return renderRunOutput({
		ran: run.results,
		live,
		leading,
		base: shown?.base,
		headLines: prepared.hasHead ? [] : [GATE_NO_HEAD_LINE.replace('{command}', 'gate --hook')],
	})
}

/**
 * The lines before the steps a hook runs: the notices (a given store ignored), the own steps' lines, the base lines,
 * the reused lines, and the running line when nothing was answered. With a live output, terminal or not, the base,
 * reused and running lines are written now, before the steps (the notices and the own steps' lines are already).
 */
function showLeadingLines(params: {
	notices: readonly string[]
	/** The lines of the hook's own steps (its tdd step): with a live output their progress showed them already. */
	ownLines: readonly string[]
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
	const later = [...params.baseLines, ...answers.lines, ...(running ? [running] : [])]
	const leading = [...params.notices, ...params.ownLines, ...later]
	if (live) for (const line of later) live.writeLine(textOf([line]))
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
		treeKey: prepared.treeKey,
		checkStore: params.checkStore,
		steps: prepared.hookSteps,
		stepHashes: prepared.stepHashes,
		emptyTree: readEmptyTree(cwd),
		hashes,
	})
}

/**
 * What a hook run starts from: the hook steps of the full list, the hook base (resolved once when a full step is
 * scoped; shown when a hook step is), whether there is a HEAD, the committed tree, what it locks and each step's
 * hash at the hook base. A result instead when the hook ends before any step: no hook step, a refused base, or a
 * node_modules that does not install the committed tree's lock (`checkInstallMatchesTree`).
 */
function prepareHookRun(params: {
	cwd: string
	/** The tree of the index git hands the hook, read once by the run. */
	tree: string
	/** False when git names another repository's index: the install is not checked against it. */
	reusable: boolean
	handoverBase: HandoverBase | undefined
	handoverIgnored: string | undefined
}): PreparedHookRun | { result: CommandResult } {
	const { cwd } = params
	// nothing to run without a package.json stops the commit, as a broken gate config does
	const source = readStepSource(cwd)
	if ('refusal' in source) throw new GateConfigError(source.refusal)
	const { packageJson } = source
	const fullSteps = resolveGateSteps({ packageJson, mode: 'full' })
	const hookSteps = resolveHookSteps({ packageJson })
	if (hookSteps.length === 0)
		return { result: { exitCode: 0, output: textOf([GATE_HOOK_NO_STEP_LINE]) } }
	// a scoped full or hook step's hash holds the base; the hook says it only when it runs a scoped step
	const hookBase = holdsScopedStep([...fullSteps, ...hookSteps])
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
	const { tree } = params
	// a node_modules that does not install the committed lock: no step runs, no record answers; an index of another
	// repository is no commit of this one to check (its steps run, keyed on nothing they answer)
	const installRefusal = params.reusable ? checkInstallMatchesTree({ root: cwd, tree }) : undefined
	if (installRefusal !== undefined)
		return { result: { exitCode: 1, output: textOf([`gate --hook: ${installRefusal}`]) } }
	return {
		packageJson,
		hookSteps,
		shown: holdsScopedStep(hookSteps) ? hookBase : undefined,
		gateBase,
		// a record is keyed on HEAD: a repository with no commit yet has none to answer and keeps none
		hasHead: readHeadOrNone(cwd) !== undefined,
		tree,
		treeKey: readTreeKey({ root: cwd, tree }),
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
	/** The release base the hook checked: handed to its rules step alone. */
	releaseBase?: string
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
		...(params.releaseBase !== undefined && { releaseBase: params.releaseBase }),
		// always: the run's events time each part, progress shown or not (D8)
		announce: function announce(step) {
			const finishPart = recorder.startPart({ name: step.name, heavy: step.heavy === true })
			const running = progress?.start({ name: step.name, detail: step.run })
			return function finished(result) {
				durations.set(result, finishPart())
				running?.finish(...renderStepLines(result).map((line) => textOf([line])))
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
	/** The hook's own steps that ran before the declared ones (its tdd step): in the run's events, never in the record. */
	own: OwnHookSteps
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
		results: [...params.own.results, ...results],
		durations: new Map([...params.own.durations, ...params.durations]),
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
 * The hook's own steps, before the declared ones: the guards' results when they ran (passed or skipped ones: a failed
 * one stopped the run), then the tdd receipts of the lot (`runHookTddStep`, at the run's one base) when the
 * package declares `dialecte.gate.hook`, none otherwise (the default hook commits inside a hand-over's clones, which
 * hold no receipts). Timed for the run's events, shown live as a step.
 */
async function runOwnHookSteps(params: {
	cwd: string
	prepared: PreparedHookRun
	live: LiveOutput | undefined
	recorder: StepHandle
	base: TddBase | { failure: string } | undefined
	/** The scope and design steps that ran, with how long each took. */
	guards: OwnHookSteps
}): Promise<OwnHookSteps> {
	const { packageJson, tree } = params.prepared
	const { results: guardParts, durations: guardDurations } = params.guards
	if (params.live)
		for (const guard of guardParts)
			for (const line of renderStepLines(guard)) params.live.writeLine(textOf([line]))
	if (packageJson.dialecte?.gate?.hook === undefined || params.base === undefined)
		return { results: guardParts, durations: guardDurations }
	const progress = params.live
		? createStepProgress({ live: params.live, clock: createSystemClock() })
		: undefined
	const running = progress?.start({ name: TDD_STEP.name, detail: HOOK_TDD_STEP_DETAIL })
	const finishPart = params.recorder.startPart({ name: TDD_STEP.name, heavy: false })
	const result = await runHookTddStep({ cwd: params.cwd, packageJson, tree, base: params.base })
	const duration = finishPart()
	running?.finish(...renderStepLines(result).map((line) => textOf([line])))
	return {
		results: [...guardParts, result],
		durations: new Map([...guardDurations, [result, duration]]),
	}
}

/**
 * The hook's guards, timed: the scope step, then the design step when the scope step did not fail; a step that does not
 * apply (no lot being committed) gives no result.
 */
function runHookGuards(params: {
	cwd: string
	packageJson: PackageJson
	lot: HookLot | undefined
	base: TddBase | { failure: string } | undefined
	tree: string
}): OwnHookSteps {
	const { cwd, packageJson, lot, base } = params
	const results: StepResult[] = []
	const durations = new Map<StepResult, number>()
	const scopeStarted = performance.now()
	const scope = runHookScopeStep({ cwd, lot, base, tree: params.tree })
	if (scope !== undefined) {
		results.push(scope)
		durations.set(scope, performance.now() - scopeStarted)
		if (scope.status === 'failed') return { results, durations }
	}
	if (base === undefined) return { results, durations }
	const designStarted = performance.now()
	const design = runHookDesignStep({ cwd, packageJson, lot, base })
	if (design !== undefined) {
		results.push(design)
		durations.set(design, performance.now() - designStarted)
	}
	return { results, durations }
}

/**
 * A hook whose guard (its scope or design step) failed: nothing else runs; the run's events hold its start and its
 * end with the guards' parts, the failed one last (as a failed tdd step's run does), the output is their lines, the
 * verdict and the next command under it (a live output gets the guards' lines first).
 */
function endFailedGuard(args: {
	params: HookGateParams
	guards: OwnHookSteps
	notices: readonly string[]
}): CommandResult {
	const { params, guards } = args
	const recorder = startStep({
		cwd: params.cwd,
		step: 'gate-hook',
		heavy: false,
		warn: params.warn,
	})
	const { live } = params
	if (live)
		for (const line of [...args.notices, ...guards.results.flatMap(renderStepLines)])
			live.writeLine(textOf([line]))
	// then ended as a run whose own step failed: the guards' parts recorded, their lines and the verdict
	return endFailedOwnRun({ own: guards, recorder, live, notices: args.notices })
}

/**
 * A hook whose own step (its tdd step) failed: no declared step runs and nothing is recorded; the run's events end
 * with that part, the output is its lines and the verdict.
 */
function endFailedOwnRun(params: {
	own: OwnHookSteps
	recorder: StepHandle
	live: LiveOutput | undefined
	notices: readonly string[]
}): CommandResult {
	const { own } = params
	const parts = partsOf({
		results: own.results,
		durations: new Map(own.durations),
		reused: new Set(),
	})
	params.recorder.end({ exit: 1, parts, reuse: reuseOf(parts), stateHash: null })
	return renderRunOutput({
		ran: own.results,
		live: params.live,
		leading: params.notices,
		base: undefined,
		headLines: [],
	})
}

/**
 * The output of a hook that ran steps: without a live output the leading lines and the steps' lines (a live output
 * printed them already), off a terminal the summary and the base line (written live on one), the no-HEAD line, the
 * verdict, and a failed step's last lines.
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
		// with a live output, terminal or not, the leading and step lines are printed already
		...(live ? [] : [...params.leading, ...ran.flatMap(renderStepLines)]),
		...(summary && !live?.tty ? [summary] : []),
		...(baseLine && !live?.tty ? [baseLine] : []),
		...params.headLines,
		failed ? GATE_HOOK_FAILED_LINE.replace('{step}', failed.step.name) : GATE_HOOK_GREEN_LINE,
		...(failed?.tail ? [GATE_FAILED_TAIL_LINE.replace('{step}', failed.step.name)] : []),
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

/**
 * The line refusing a handed release base that is no full commit id the repository at `cwd` holds; undefined when it
 * is one, or when none was handed.
 */
function releaseBaseRefusalOf(params: {
	cwd: string
	releaseBase: string | undefined
}): string | undefined {
	const { releaseBase } = params
	if (releaseBase === undefined) return undefined
	const known =
		FULL_OBJECT_ID_PATTERN.test(releaseBase) &&
		verifiedCommitOf({ root: params.cwd, revision: releaseBase }) === releaseBase
	return known
		? undefined
		: RELEASED_CHANGELOG_LINES.unknownBase.replace('{value}', () => releaseBase)
}
