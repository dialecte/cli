/**
 * `dialecte contrib [--no-reuse] [--json]` - the contributor checks of a dialecte package, after `gate --full`
 * and before `dialecte handover`: rules, the package's steps, the release guard, the mutation line. The command
 * runs them, and so does a rehearsal in its scratch clone (its record goes to the repository's store, marked as a
 * rehearsal's).
 *
 * The rows, in order: `rules` on the files changed against HEAD (recorded as `dialecte rules` records it), judged
 * against the gate base (`resolveConfiguredBase`; a rehearsal's against the last merge lot's tip, else the base its
 * repository resolves): an error of a quality rule on a line the base already holds is a warning, `(not added by
 * this change)`. Then the package's `dialecte.contrib.steps` (else the docs build and the type bench) run as the
 * gate runs its steps, `release` (no dependency named by a local folder), then `mutation`, read from the mutation
 * store now and never recorded (only when the package declares a mutation scope). A package step a green
 * `gate --full` record of this tree and install passed with the same name and command is not run again.
 *
 * The run is recorded in the worktree's git folder (`dialecte-gate-contrib.json`) and in the repository's store of
 * records by tree, keyed by the tree, the install, the steps, the cli and HEAD (the rules row reads the files changed
 * against it). A green record of the same key answers the rows instead of running them; `--no-reuse` runs them,
 * and runs again a step a `gate --full` passed. Exit 0 green, 1 a row failed, 2 refused: a consumer (nothing is
 * written), a value no command accepts in package.json.
 */
import { hasFlag } from '../config.ts'
import { partsOf, reuseOf, startStep } from '../events/record-step.ts'
import { computeCheckKey } from '../gate-records/check-key.ts'
import { findReusableRecord, originOfRecord } from '../gate-records/check-store.ts'
import { recordCheckedRun, renderReuseLine, reusedResults } from '../gate-records/record-reuse.ts'
import { computeStateTree } from '../gate-records/state-hash.ts'
import { resolveConfiguredBase } from '../gate/gate-base.ts'
import {
	GATE_STATE_CHANGED_LINE,
	STEP_DETAIL_INDENT,
	STEP_LINE_MARKS,
	UNWIRED_NOT_RUN_REASON,
} from '../gate/gate-config.constants.ts'
import { renderAbsentDerivedLines, validateGateConfig } from '../gate/gate-config.ts'
import { runGateSteps } from '../gate/run-gate.ts'
import { renderStepDetail } from '../gate/step-line.ts'
import { findUnwiredSteps } from '../gate/unwired-steps.ts'
import { currentBranchOf, readGit } from '../git.ts'
import { readMutationMode } from '../mutation/lot-mode.ts'
import { MUTATION_GATE_NAME } from '../mutation/pending-verdict.constants.ts'
import { pendingVerdict } from '../mutation/pending-verdict.ts'
import { readPackageJson } from '../package-json.ts'
import { jsonOf, joinedOf, textOf } from '../print/print.ts'
import { childLinesOf, relayedTextOf } from '../print/relayed.ts'
import { readProfile } from '../profile/profile.ts'
import { createStepProgress } from '../progress/step-progress.ts'
import { createSystemClock } from '../progress/system-clock.ts'
import {
	checkPublishable,
	findLocalDependencies,
	renderLocalDependency,
} from '../release/local-dependencies.ts'
import { checkRules, renderRuleFinding } from '../rules/check-rules.ts'
import { readReferencePatterns } from '../rules/committed-text.ts'
import { contribKeyHash } from './contrib-key.ts'
import { resolveContribSteps } from './contrib-steps.ts'
import {
	CONTRIB_BUILTIN_STEPS,
	CONTRIB_CONSUMER_REFUSAL,
	CONTRIB_FAILED_VERDICT,
	CONTRIB_GREEN_VERDICT,
	CONTRIB_REUSED_VERDICT,
	CONTRIB_SKIP_LABEL,
	CONTRIB_WARNING_MARK,
	GATE_STEP_REUSED_NOTE,
	CONTRIB_COMMAND,
	CONTRIB_RECORD_MODE,
	CONTRIB_NO_COMMIT,
	CONTRIB_NO_REPOSITORY,
	NO_CHANGED_FILE_NOTE,
	NO_LOCAL_DEPENDENCY_NOTE,
	RULES_FIRST_ERROR,
	RULES_MORE_ERRORS,
} from './contrib.constants.ts'
import { findPassedGateStep, readFullGateRecords } from './gate-step-reuse.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { StepHandle } from '../events/record-step.types.ts'
import type { RecordedStep } from '../gate-records/gate-records.types.ts'
import type { GateStep } from '../gate/gate-config.types.ts'
import type { StepResult } from '../gate/gate.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type { LiveOutput, StepProgress } from '../progress/step-progress.types.ts'
import type { RuleFinding } from '../rules/check-code-rules.types.ts'
import type { ContribLine, ContribStep, FullGateRecords } from './contrib.types.ts'

export async function runContrib(params: {
	cwd: string
	argv: string[]
	/** Where each row's line (or a step's spinner) goes while it runs; the result is returned at the end. */
	live?: LiveOutput
	/** The repository whose store holds the record, when the run is a rehearsal's in a scratch clone of it. */
	storeRoot?: string
	/**
	 * The commit the rules row judges against: an error of a quality rule on a line it already holds is a warning
	 * (`(not added by this change)`). A rehearsal passes the base its repository resolves; `null`: no base, every
	 * error stays one. Without it, the row takes the scoped gate step's base (none when the package has no scoped step).
	 */
	rulesBase?: string | null
	/** Where the one `events: not recorded: <reason>` line goes (standard error unless given). */
	warn?: (line: string) => void
}): Promise<CommandResult> {
	const { cwd, argv, live } = params
	const json = hasFlag(argv, 'json')
	const reusable = !hasFlag(argv, 'no-reuse')
	const configuration = readConfiguration(cwd)
	if ('refusal' in configuration) return { exitCode: 2, output: textOf([configuration.refusal]) }
	const { packageJson, steps } = configuration
	// the run's events: its start before any row, its end after the record (D12); contrib is heavy as a whole
	const recorder = startStep({ cwd, step: 'contrib', heavy: true, warn: params.warn })
	const durations = new Map<StepResult, number>()
	const reusedParts = new Set<StepResult>()

	const commandHash = contribKeyHash({
		root: cwd,
		steps,
		head: readGit({ root: cwd, args: ['rev-parse', 'HEAD'] }).trim(),
	})
	const keyBefore = computeCheckKey({ root: cwd, commandHash })
	const found = reusable
		? findReusableRecord({ root: cwd, mode: CONTRIB_RECORD_MODE, key: keyBefore })
		: undefined
	const progress = live ? createStepProgress({ live, clock: createSystemClock() }) : undefined
	const shownLive = new Set<StepResult>()
	/** The row's line (and the lines under it), live, in run order. */
	function showLive(shown: { result: StepResult; finish?: (...lines: string[]) => void }): void {
		const lines = renderResultLines(shown.result).map((line) => textOf([line]))
		if (shown.finish) shown.finish(...lines)
		else for (const line of lines) live?.writeLine(line)
		shownLive.add(shown.result)
	}
	// a derived step the package has no script for: one skip line where it would run (before release), no row
	const absentLines = renderAbsentDerivedLines({ packageJson, steps: packageStepsOf(steps) })
	/** The absent lines, live, once: before the release row, or after the last row when none comes. */
	let absentShown = false
	function showAbsentLive(): void {
		if (absentShown || !progress) return
		absentShown = true
		for (const line of absentLines) live?.writeLine(textOf([line]))
	}
	if (found && progress)
		live?.writeLine(renderReuseLine({ command: CONTRIB_COMMAND, record: found }))
	const results = found
		? reusedResults({ record: found, steps: packageStepsOf(steps) })
		: await runRows({
				root: cwd,
				steps,
				packageJson,
				...rowBasesOf({ root: cwd, packageJson, rulesBase: params.rulesBase, reusable }),
				progress,
				showLive,
				beforeRelease: showAbsentLive,
				recorder,
				durations,
				reusedParts,
			})
	if (found) for (const result of results) reusedParts.add(result)
	if (found && progress)
		for (const result of results) {
			if (isReleaseRow(result.step)) showAbsentLive()
			showLive({ result })
		}
	showAbsentLive()
	const original = found && originOfRecord(found)
	const { changedWhileRunning, stateHash } = recordCheckedRun({
		root: cwd,
		mode: CONTRIB_RECORD_MODE,
		results,
		keyBefore,
		keyAfter: found ? keyBefore : computeCheckKey({ root: cwd, commandHash }),
		...(found && { reused: found }),
		...(params.storeRoot && { storeRoot: params.storeRoot }),
	})

	const mutation = mutationLine(cwd)
	if (mutation && progress)
		for (const line of renderContribLines(mutation)) live?.writeLine(textOf([line]))
	const lines = [...results.map(contribLineOf), ...(mutation ? [mutation] : [])]
	const failed = lines.filter((line) => line.row.status === 'failed').map((line) => line.row.name)
	const exitCode = failed.length ? 1 : 0
	const parts = partsOf({ results, durations, reused: reusedParts })
	recorder.end({ exit: exitCode, parts, reuse: reuseOf(parts), stateHash })
	if (json)
		return {
			exitCode,
			output: jsonOf(
				{
					profile: 'contributor',
					rows: lines.map((line) => line.row),
					...(original && { reused: original }),
				},
				2,
			),
		}
	const failedStep = results.find((result) => result.status === 'failed' && result.tail)
	const summary = textOf([
		...(found && !live?.tty ? [renderReuseLine({ command: CONTRIB_COMMAND, record: found })] : []),
		// on a terminal a row's line is on the screen already: the summary does not repeat it
		...results
			.filter((result) => !(live?.tty && shownLive.has(result)))
			.flatMap((result) => [
				...(isReleaseRow(result.step) ? absentLines : []),
				...renderResultLines(result),
			]),
		// no release row to stand before (a reused record): after the rows
		...(live?.tty || results.some((result) => isReleaseRow(result.step)) ? [] : absentLines),
		...(mutation && !live?.tty ? renderContribLines(mutation) : []),
		...(changedWhileRunning ? [GATE_STATE_CHANGED_LINE] : []),
		failed.length
			? CONTRIB_FAILED_VERDICT.replace('{rows}', failed.join(', '))
			: found
				? CONTRIB_REUSED_VERDICT
				: CONTRIB_GREEN_VERDICT,
		...(failedStep?.tail ? [`--- last lines of ${failedStep.step.name} ---`] : []),
	])
	// the failed step's last lines are its own output, relayed line by line
	return {
		exitCode,
		output: failedStep?.tail
			? joinedOf([summary, relayedTextOf(childLinesOf(failedStep.tail))])
			: summary,
	}
}

/** The package and its contrib rows; a refusal for a consumer, or for a value no command accepts. */
function readConfiguration(
	root: string,
): { packageJson: PackageJson; steps: ContribStep[] } | { refusal: string } {
	try {
		if (readProfile(root) === 'consumer') return { refusal: CONTRIB_CONSUMER_REFUSAL }
		const repositoryRefusal = refuseRepository(root)
		if (repositoryRefusal) return { refusal: repositoryRefusal }
		const packageJson = readPackageJson(root)
		const steps = resolveContribSteps({ packageJson })
		// the gate lists contrib's lookup of gate records reads: refused before any row runs
		validateGateConfig(packageJson)
		// the rules row would throw on an invalid allowReferences: refused before any row runs
		readReferencePatterns(root)
		return { packageJson, steps }
	} catch (error) {
		return { refusal: `contrib: ${error instanceof Error ? error.message : String(error)}` }
	}
}

/**
 * Why the folder cannot be checked: it is in no git repository, or its repository has no commit yet (the rules row
 * and the record's key read HEAD); undefined when it can.
 */
function refuseRepository(root: string): string | undefined {
	try {
		readGit({ root, args: ['rev-parse', '--is-inside-work-tree'] })
	} catch {
		return CONTRIB_NO_REPOSITORY.replace('{root}', root)
	}
	try {
		readGit({ root, args: ['rev-parse', '--verify', '--quiet', 'HEAD'] })
	} catch {
		return CONTRIB_NO_COMMIT.replace('{root}', root)
	}
	return undefined
}

/** Runs the rows in order: the built-in ones in process, the package steps as the gate runs its steps. */
async function runRows(params: {
	root: string
	steps: readonly ContribStep[]
	packageJson: PackageJson
	/** The commit the rules row judges against; undefined: no base, every error stays one. */
	rulesBase: string | undefined
	/** The current `gate --full` records; undefined with `--no-reuse`. */
	gate: FullGateRecords | undefined
	progress: StepProgress | undefined
	showLive: (shown: { result: StepResult; finish?: (...lines: string[]) => void }) => void
	/** Called before the release row starts. */
	beforeRelease: () => void
	/** The run's recorder: each row that runs is timed as a part. */
	recorder: StepHandle
	/** Filled: how long each row ran. */
	durations: Map<StepResult, number>
	/** Filled: the rows a green `gate --full` answered. */
	reusedParts: Set<StepResult>
}): Promise<StepResult[]> {
	const { root, packageJson, gate, progress, showLive, recorder, durations } = params
	// as the gate does: every package row judged for its wiring before any row runs, a default one failed too
	const unwired = findUnwiredSteps({
		steps: packageStepsOf(params.steps),
		packageJson,
		failDefault: true,
		skipLabel: CONTRIB_SKIP_LABEL,
	})
	if ([...unwired.values()].some((result) => result.status === 'failed'))
		return unwiredRows({ ...params, unwired })
	const results: StepResult[] = []
	// as the gate does: after a package step that failed, the next ones are not run
	let packageStepFailed = false
	for (const step of params.steps) {
		if ('builtin' in step) {
			if (isReleaseRow(step)) params.beforeRelease()
			const running = progress?.start({ name: step.name, detail: `dialecte ${step.builtin}` })
			const finishPart = recorder.startPart({ name: step.name, heavy: false })
			const base = params.rulesBase
			const result = step.builtin === 'rules' ? rulesResult({ root, base }) : releaseResult(root)
			durations.set(result, finishPart())
			results.push(result)
			if (running) showLive({ result, finish: running.finish })
			continue
		}
		// an opted-out row: its result as judged, never announced
		const judged = packageStepFailed ? undefined : unwired.get(step)
		if (judged) {
			results.push(judged)
			if (progress) showLive({ result: judged })
			continue
		}
		const passed = gate && !packageStepFailed ? findPassedGateStep({ gate, step }) : undefined
		if (packageStepFailed || passed) {
			const result: StepResult = passed
				? gateReusedResult({ step, ...passed })
				: { step, status: 'not-run', counts: {}, restored: [] }
			results.push(result)
			if (passed) params.reusedParts.add(result)
			if (progress) showLive({ result })
			continue
		}
		const [result] = await runGateSteps({
			root,
			steps: [step],
			packageJson,
			// always: the run's events time each part, progress shown or not (D8)
			announce: function announce(announced) {
				const finishPart = recorder.startPart({
					name: announced.name,
					heavy: announced.heavy === true,
				})
				const running = progress?.start({ name: announced.name, detail: announced.run })
				return function finished(finishedResult) {
					durations.set(finishedResult, finishPart())
					if (running) showLive({ result: finishedResult, finish: running.finish })
				}
			},
		})
		results.push(result)
		packageStepFailed = result.status === 'failed'
	}
	return results
}

/**
 * The rows of a run with a failed unwired package row: each judged row its result, every other row (the built-in
 * ones included) `not-run` with `UNWIRED_NOT_RUN_REASON`; nothing runs, each row shown live when progress is.
 */
function unwiredRows(params: {
	steps: readonly ContribStep[]
	unwired: ReadonlyMap<GateStep, StepResult>
	progress: StepProgress | undefined
	showLive: (shown: { result: StepResult }) => void
	beforeRelease: () => void
}): StepResult[] {
	return params.steps.map(function rowOf(step): StepResult {
		const judged = 'builtin' in step ? undefined : params.unwired.get(step)
		const result: StepResult = judged ?? {
			step: 'builtin' in step ? { name: step.name, run: '' } : step,
			status: 'not-run',
			counts: {},
			restored: [],
			reason: UNWIRED_NOT_RUN_REASON,
		}
		if (params.progress && isReleaseRow(step)) params.beforeRelease()
		if (params.progress) params.showLive({ result })
		return result
	})
}

/**
 * What the rows read of the gate base, resolved once (`resolveConfiguredBase`): the commit the rules row judges
 * against (`rulesBase` when given, none when it is `null`, else the scoped gate step's base; none without a scoped
 * step or with a refused base branch) and, unless `--no-reuse`, the `gate --full` records read with that same base.
 */
function rowBasesOf(params: {
	root: string
	packageJson: PackageJson
	rulesBase: string | null | undefined
	reusable: boolean
}): Pick<Parameters<typeof runRows>[0], 'rulesBase' | 'gate'> {
	const { root, packageJson } = params
	const base = resolveConfiguredBase({ root, packageJson })
	const configured = base === undefined || 'refusal' in base ? undefined : base.commit
	return {
		rulesBase: params.rulesBase === null ? undefined : (params.rulesBase ?? configured),
		gate: params.reusable ? readFullGateRecords({ root, packageJson, base }) : undefined,
	}
}

/**
 * The rules row: the code rules on the files changed against HEAD, recorded as `dialecte rules` records them; with
 * `base`, an error of a quality rule on a line the base already holds is a warning.
 */
function rulesResult(params: { root: string; base: string | undefined }): StepResult {
	const check = checkRules({
		root: params.root,
		givenFiles: [],
		...(params.base !== undefined && { base: params.base }),
	})
	const errors = check.findings.filter((finding) => finding.severity === 'error')
	const warnings = check.findings.filter((finding) => finding.severity === 'warning')
	return {
		step: { name: 'rules', run: '' },
		status: errors.length ? 'failed' : 'passed',
		counts: { errors: check.errors, warnings: check.warnings },
		restored: [],
		...(errors.length && { reason: firstErrorOf(errors) }),
		...(check.files.length === 0 && { note: NO_CHANGED_FILE_NOTE }),
		// every finding under the row, errors first: the row's line stays one line
		...(check.findings.length && { details: [...errors, ...warnings].map(renderRuleFinding) }),
	}
}

/** `first: <file>:<line>:<column> <rule>`, and how many more errors there are. */
function firstErrorOf(errors: readonly RuleFinding[]): string {
	const [first] = errors
	const more =
		errors.length > 1 ? RULES_MORE_ERRORS.replace('{count}', String(errors.length - 1)) : ''
	return `${RULES_FIRST_ERROR.replace('{file}', `${first.file}:${first.line}:${first.column}`).replace('{rule}', first.rule)}${more}`
}

/** The release row: no dependency of package.json named by a local folder, which only resolves on this machine. */
function releaseResult(root: string): StepResult {
	const step = { name: 'release', run: '' }
	const publishable = checkPublishable({ root })
	if (publishable.exitCode === 0)
		return { step, status: 'passed', counts: {}, restored: [], note: NO_LOCAL_DEPENDENCY_NOTE }
	const local = findLocalDependencies({ packageJson: readPackageJson(root) })
	return {
		step,
		status: 'failed',
		counts: {},
		restored: [],
		reason: local.map(renderLocalDependency).join('; '),
		// the publish check's own lines under the row: the refusal, each dependency, how to pin them
		details: publishable.lines,
	}
}

/** A package step a current `gate --full` record passed: passed, with the gate's counts and when it ran. */
function gateReusedResult(params: {
	step: GateStep
	recorded: RecordedStep
	origin: { at: string }
}): StepResult {
	return {
		step: params.step,
		status: 'passed',
		counts: params.recorded.counts,
		restored: [],
		note: GATE_STEP_REUSED_NOTE.replace('{at}', params.origin.at),
	}
}

/** The row is the built-in release row, the last of every run. */
function isReleaseRow(step: { name: string }): boolean {
	return step.name === CONTRIB_BUILTIN_STEPS.last.name
}

/** The package steps among the rows: those with a shell command. */
function packageStepsOf(steps: readonly ContribStep[]): GateStep[] {
	return steps.flatMap((step) => ('builtin' in step ? [] : [step]))
}

/**
 * The mutation row: what the package still owes, read from the mutation store now; none when the package declares
 * no mutation scope.
 */
function mutationLine(root: string): ContribLine | undefined {
	const verdict = pendingVerdict({
		root,
		branch: currentBranchOf(root),
		mergedBranches: [],
		lotMode: readMutationMode({ root }),
		tree: function stateTree() {
			return computeStateTree(root)
		},
	})
	if (!verdict) return undefined
	return {
		row: { name: MUTATION_GATE_NAME, status: verdict.status, detail: verdict.detail },
		under: verdict.lines,
	}
}

function contribLineOf(result: StepResult): ContribLine {
	return {
		row: { name: result.step.name, status: result.status, detail: renderStepDetail(result) },
		under: result.details ?? [],
	}
}

/** A row's line, then the lines under it. */
function renderResultLines(result: StepResult): string[] {
	return renderContribLines(contribLineOf(result))
}

function renderContribLines(line: ContribLine): string[] {
	const { row } = line
	const mark = row.status === 'warning' ? CONTRIB_WARNING_MARK : STEP_LINE_MARKS[row.status]
	return [
		[mark, row.name, row.detail].filter(Boolean).join('  '),
		...line.under.map((under) => `${STEP_DETAIL_INDENT}${under}`),
	]
}
