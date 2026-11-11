/**
 * A hook's output read as steps: each npm script header starts one, its warning and error lines picked out,
 * and the lines printed after the hook (one summary line, the lines worth reading, the full log's path).
 * The same reader serves a hook still running (a line at a time) and its whole output once it ended.
 */
import { stripVTControlCharacters } from 'node:util'

import { counted } from '../counted.ts'
import { GATE_BASE_SOURCES } from '../gate/gate-base.constants.ts'
import {
	FLAKY_NOTE,
	GATE_HOOK_BASE_PATTERN,
	GATE_HOOK_REUSED_PATTERN,
} from '../gate/gate-config.constants.ts'
import { readStepCounts } from '../gate/step-counts.ts'
import { textOf } from '../print/print.ts'
import {
	COMMAND_SEPARATORS,
	FAILING_TAIL_LINES,
	HOOK_FLAKY_FILE_PATTERN,
	HOOK_LINE_PATTERNS,
	HOOK_WARNING_KINDS,
	NPM_COMMAND_LINE,
	NPM_RUN_SCRIPT,
	NPM_SCRIPT_HEADER,
	PARALLEL_FLAGS,
	PARALLEL_RUNNER,
	PLAIN_HOOK_STEP,
	REPEAT_COUNT_SUFFIX,
	RUN_ALL_RUNNERS,
	RUNNER_ARGUMENT,
	SCRIPT_FAILURE,
	SCRIPT_NAME_SEPARATOR,
	SCRIPT_RUNNER,
	STEP_COUNT_SUFFIX,
	STEP_LABEL,
	TEST_RUNNER_COMMAND,
	TEST_STEP_KINDS,
	TEST_STEP_SEGMENT,
} from './hook-output.constants.ts'

import type { RecordOrigin } from '../gate-records/gate-records.types.ts'
import type { UsedGateBase } from '../gate/gate-base.types.ts'
import type { StepCounts } from '../gate/gate.types.ts'
import type {
	CountedFlaggedLine,
	FlaggedHookLine,
	HookLineKind,
	HookParentStep,
	HookStep,
	HookStepReader,
	HookSummaryStep,
	PlacedFlaggedLine,
	RepeatedLine,
	ScriptsRun,
} from './hook-output.types.ts'

/** The kind of a warning or error line of a tool the hook runs; undefined for any other line. */
export function classifyHookLine(line: string): HookLineKind | undefined {
	const text = stripVTControlCharacters(line)
	return HOOK_LINE_PATTERNS.find((entry) => entry.pattern.test(text))?.kind
}

/**
 * The hook's steps in the order they started; a hook printing no npm header is one step `hook`. A header
 * is a `> <package>@<version> <script>` line after a blank line (or first), followed by its `> <command>` line.
 */
export function readHookSteps(output: string): HookStep[] {
	return readHookOutput({ output }).steps
}

/** The hook's steps and its flagged lines, each with the step holding it and its place in that step's lines. */
function readHookOutput(params: { output: string }): {
	steps: HookStep[]
	flagged: PlacedFlaggedLine[]
} {
	const lines = params.output.split('\n')
	if (lines.at(-1) === '') lines.pop()
	const flagged: PlacedFlaggedLine[] = []
	const reader = createHookStepReader({
		onFlagged: function placeFlagged(entry, step) {
			flagged.push({ flagged: entry, step, index: step.lines.length - 1 })
		},
	})
	for (const line of lines) reader.read(line)
	return { steps: reader.end(), flagged }
}

/**
 * Reads a hook's output a line at a time: `onStep` hears each step as its header is read (a script run in
 * parallel by its parent is none: its lines stay the parent's), `onFlagged` each warning or error line with
 * the step holding it, its last line. In a test step only its failures are flagged.
 */
export function createHookStepReader(params: {
	onStep?: (step: HookStep) => void
	onFlagged?: (flagged: FlaggedHookLine, step: HookStep) => void
}): HookStepReader {
	const steps: HookStep[] = []
	const parents: HookParentStep[] = []
	const testSteps = new Set<HookStep>()
	// the lines before the first step: a step `hook` once one is not blank
	const leading: string[] = []
	let current: HookStep | undefined
	let previousBlank = true
	let pendingHeader: string | undefined

	function append(line: string): void {
		previousBlank = line.trim() === ''
		if (current) current.lines.push(line)
		else {
			leading.push(line)
			if (previousBlank) return
			current = { name: PLAIN_HOOK_STEP, lines: leading, runsScripts: false }
			steps.push(current)
			params.onStep?.(current)
		}
		const kind = classifyHookLine(line)
		if (!kind) return
		if (testSteps.has(current) && !TEST_STEP_KINDS.includes(kind)) return
		params.onFlagged?.(
			{
				line,
				kind,
				step: current.name,
				label: `${STEP_LABEL.replace('{step}', current.name)}${line}`,
			},
			current,
		)
	}

	function startStep(header: { line: string; command: string }): void {
		previousBlank = false
		const name = NPM_SCRIPT_HEADER.exec(header.line)?.[1] ?? PLAIN_HOOK_STEP
		const run = readScriptsRun(header.command)
		// the nearest step running this script; the steps it ran after that one are done
		while (
			parents.length > 0 &&
			!parents[parents.length - 1].scripts.some((script) =>
				matchesScript({ pattern: script, name }),
			)
		)
			parents.pop()
		const parent = parents.at(-1)
		if (parent?.parallel) {
			parent.step.lines.push(header.line, header.command)
			current = parent.step
			return
		}
		const step: HookStep = {
			name,
			lines: [header.command],
			runsScripts: run.scripts.length > 0,
			...(parent && { parent: parent.step.name }),
		}
		steps.push(step)
		current = step
		if (isTestStep({ name, commandLine: header.command })) testSteps.add(step)
		if (step.runsScripts) parents.push({ ...run, step })
		params.onStep?.(step)
	}

	return {
		read(text) {
			const line = visibleLine(text)
			if (pendingHeader !== undefined) {
				const header = pendingHeader
				pendingHeader = undefined
				if (NPM_COMMAND_LINE.test(line)) {
					startStep({ line: header, command: line })
					return
				}
				append(header)
			}
			if (previousBlank && NPM_SCRIPT_HEADER.test(line)) {
				pendingHeader = line
				return
			}
			append(line)
		},
		end() {
			if (pendingHeader !== undefined) append(pendingHeader)
			pendingHeader = undefined
			if (steps.length === 0)
				steps.push({ name: PLAIN_HOOK_STEP, lines: leading, runsScripts: false })
			return steps
		},
	}
}

/**
 * The lines printed once the hook ended (without the hook prefix): its summary line, then the warning lines
 * (passed) or the error lines not among the failing step's last lines, then those lines (failed), each
 * labelled by its step, then the full log's path. A line its step printed several times is listed once,
 * where it was first printed, with its count (`(×3)`). The summary names the steps `hookSummarySteps`
 * selects and counts the distinct warnings per step and kind.
 */
export function hookOutcomeLines(params: {
	output: string
	passed: boolean
	logPath: string
}): string[] {
	const { steps, flagged } = readHookOutput({ output: params.output })
	const parts = hookSummarySteps({ steps, passed: params.passed }).map(function summaryPart(entry) {
		const counts = renderHookCounts(entry.counts)
		return `${entry.name} ${entry.failed ? '✗' : '✓'}${counts ? ` ${counts}` : ''}`
	})
	const logLine = textOf([`full log: ${params.logPath}`])
	if (params.passed) {
		const shown = distinctFlaggedLines(flagged.map((entry) => entry.flagged))
		return [
			[...parts, ...warningCounts(shown.map((entry) => entry.flagged))].join(' · '),
			...shown.map(countedLabel),
			logLine,
		]
	}
	const failing = steps.at(-1)
	const tail = failing?.lines ?? []
	const tailStart = Math.max(tail.length - FAILING_TAIL_LINES, 0)
	const before = flagged.filter(
		(entry) =>
			!HOOK_WARNING_KINDS.includes(entry.flagged.kind) &&
			(entry.step !== failing || entry.index < tailStart),
	)
	return [
		parts.join(' · '),
		...distinctFlaggedLines(before.map((entry) => entry.flagged)).map(countedLabel),
		...tail.slice(tailStart),
		logLine,
	]
}

/**
 * The flagged lines each once, in the order first printed, with how many times its step printed it: lines
 * of different steps never merge (their labels differ).
 */
function distinctFlaggedLines(flagged: readonly FlaggedHookLine[]): CountedFlaggedLine[] {
	const byLabel = new Map<string, CountedFlaggedLine>()
	for (const entry of flagged) {
		const seen = byLabel.get(entry.label)
		if (seen) seen.count += 1
		else byLabel.set(entry.label, { flagged: entry, count: 1 })
	}
	return [...byLabel.values()]
}

function countedLabel(entry: CountedFlaggedLine): string {
	return withRepeatCount({ text: entry.flagged.label, count: entry.count })
}

/** A flagged line as shown: `<line> (×<count>)` from a count of 2, else the line. */
export function withRepeatCount(params: RepeatedLine): string {
	return params.count > 1
		? `${params.text}${REPEAT_COUNT_SUFFIX.replace('{count}', String(params.count))}`
		: params.text
}

/**
 * The steps a hook's summary names, in the order they started: the scripts the hook file runs, a script they
 * run only when it has counts or is the one that failed, and after the failing step the tasks run-p says
 * failed. A failed hook's failing step is its last; it and the steps running it failed. A warning or error
 * line a step printed several times counts once.
 */
export function hookSummarySteps(params: {
	steps: HookStep[]
	passed: boolean
}): HookSummaryStep[] {
	const { steps } = params
	const failing = params.passed ? undefined : steps.at(-1)
	const failed = failingChain({ steps, failing })
	return steps.flatMap(function summaryStep(step) {
		const counts = step.runsScripts ? {} : readStepCounts(withoutRepeats(step.lines).join('\n'))
		const stepFailed = failed.has(step)
		if (step.parent && !renderHookCounts(counts) && !stepFailed) return []
		const tasks =
			step === failing
				? failedTasks(step.lines).map((task) => ({ name: task, failed: true, counts: {} }))
				: []
		const reused = readHookReuse(step.lines)
		const flaky = stepFailed ? [] : readFlakyFiles(step.lines)
		return [
			{
				name: step.name,
				failed: stepFailed,
				counts,
				...(reused && { reused }),
				...(flaky.length && { flaky }),
			},
			...tasks,
		]
	})
}

/**
 * The files `gate --hook` named flaky under a step that failed in parallel and passed on its serial rerun (its line
 * says `flaky in parallel`), sorted and each once; none when no line says so.
 */
function readFlakyFiles(lines: readonly string[]): string[] {
	const visible = lines.map((line) => stripVTControlCharacters(line))
	if (!visible.some((line) => line.includes(FLAKY_NOTE))) return []
	const files = visible.flatMap((line) => {
		const match = HOOK_FLAKY_FILE_PATTERN.exec(line)
		return match ? [match[1].trim()] : []
	})
	return [...new Set(files)].sort()
}

/** The record `gate --hook` says it answered from (`GATE_HOOK_REUSED_LINE`): its time and short HEAD. */
function readHookReuse(lines: readonly string[]): RecordOrigin | undefined {
	const match = GATE_HOOK_REUSED_PATTERN.exec(stripVTControlCharacters(lines.join('\n')))
	return match ? { at: match[2], head: match[3] } : undefined
}

/**
 * The base a hook's `gate --hook` printed it used (`GATE_HOOK_BASE_LINE`), the last one printed; undefined when
 * it printed none, or none of a source this cli knows.
 */
export function readHookBase(output: string): UsedGateBase | undefined {
	const matches = [...stripVTControlCharacters(output).matchAll(GATE_HOOK_BASE_PATTERN)]
	const last = matches.at(-1)
	if (last === undefined) return undefined
	const source = GATE_BASE_SOURCES.find((known) => known === last[2])
	return source === undefined ? undefined : { commit: last[1], source }
}

/** The lines without a warning or error line printed already before (the same text). */
function withoutRepeats(lines: readonly string[]): string[] {
	const flagged = new Set<string>()
	return lines.filter(function firstPrinted(line) {
		if (!classifyHookLine(line)) return true
		if (flagged.has(line)) return false
		flagged.add(line)
		return true
	})
}

/**
 * A step running tests: a `test` segment in its name (`test:run`, `unit:test`), or a test runner on its
 * command line (`> vitest run`, `> node --test`).
 */
function isTestStep(params: { name: string; commandLine: string }): boolean {
	return (
		params.name.split(SCRIPT_NAME_SEPARATOR).includes(TEST_STEP_SEGMENT) ||
		TEST_RUNNER_COMMAND.test(params.commandLine)
	)
}

/** A line as a terminal shows it: no line end, only the text after its last carriage return. */
function visibleLine(text: string): string {
	const line = text.endsWith('\r') ? text.slice(0, -1) : text
	return line.slice(line.lastIndexOf('\r') + 1)
}

/** The npm scripts a command line runs: `npm run` one after the other, npm-run-all's runners by their flags. */
function readScriptsRun(commandLine: string): ScriptsRun {
	const scripts = [...commandLine.matchAll(NPM_RUN_SCRIPT)].map((match) => match[1])
	const runner = SCRIPT_RUNNER.exec(commandLine)
	if (!runner) return { scripts, parallel: false }
	const runnerArguments: string[] = []
	for (const match of runner[2].matchAll(RUNNER_ARGUMENT)) {
		const argument = match[1] ?? match[2] ?? match[3]
		if (match[3] !== undefined && COMMAND_SEPARATORS.includes(argument)) break
		runnerArguments.push(argument)
	}
	const parallel =
		runner[1] === PARALLEL_RUNNER ||
		(RUN_ALL_RUNNERS.includes(runner[1]) &&
			runnerArguments.some((argument) => PARALLEL_FLAGS.includes(argument)))
	const named = runnerArguments
		.filter((argument) => !argument.startsWith('-'))
		.map((argument) => argument.split(' ')[0])
	return { scripts: [...scripts, ...named], parallel }
}

/** A script name against a runner's argument: a name, or a pattern (`*` within a segment, `**` across). */
function matchesScript(params: { pattern: string; name: string }): boolean {
	if (!params.pattern.includes('*')) return params.pattern === params.name
	const source = params.pattern
		.split('**')
		.map((part) =>
			part
				.split('*')
				.map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
				.join('[^:]*'),
		)
		.join('.*')
	return new RegExp(`^${source}$`).test(params.name)
}

/** The failing step and the steps running it. */
function failingChain(params: { steps: HookStep[]; failing: HookStep | undefined }): Set<HookStep> {
	const chain = new Set<HookStep>()
	let step = params.failing
	while (step) {
		chain.add(step)
		const index = params.steps.indexOf(step)
		const parentName = step.parent
		step =
			parentName === undefined
				? undefined
				: params.steps
						.slice(0, index)
						.reverse()
						.find((candidate) => candidate.name === parentName)
	}
	return chain
}

/** The tasks run-p says failed among `lines`, each once. */
function failedTasks(lines: readonly string[]): string[] {
	const tasks = lines.flatMap((line) => {
		const match = SCRIPT_FAILURE.exec(stripVTControlCharacters(line))
		return match ? [match[1]] : []
	})
	return [...new Set(tasks)]
}

/**
 * Each kind of warning with its count per step, in the order first printed: `2 lint warnings in lint:check`.
 */
function warningCounts(flagged: readonly FlaggedHookLine[]): string[] {
	const counts = new Map<string, { kind: HookLineKind; step: string; count: number }>()
	for (const entry of flagged) {
		if (!HOOK_WARNING_KINDS.includes(entry.kind)) continue
		const key = `${entry.step}\n${entry.kind}`
		const tally = counts.get(key) ?? { kind: entry.kind, step: entry.step, count: 0 }
		tally.count += 1
		counts.set(key, tally)
	}
	return [...counts.values()].map(
		(entry) =>
			`${counted({ count: entry.count, noun: entry.kind })}${STEP_COUNT_SUFFIX.replace('{step}', entry.step)}`,
	)
}

/** A step's counts in its summary: `1214`, `1210 (4 skipped)`, `1 failed of 1214`, `2 errors`; '' for none. */
function renderHookCounts(counts: StepCounts): string {
	if (counts.tests) {
		const { passed, failed, skipped, total } = counts.tests
		if (failed) return `${failed} failed of ${total}`
		return `${passed}${skipped ? ` (${skipped} skipped)` : ''}`
	}
	if (counts.errors) return counted({ count: counts.errors, noun: 'error' })
	return ''
}
