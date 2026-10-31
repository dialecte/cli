/**
 * A hook's output read as steps: each npm script header starts one, its warning and error lines picked out,
 * and the lines printed after the hook (one summary line, the lines worth reading, the full log's path).
 * The same reader serves a hook still running (a line at a time) and its whole output once it ended.
 */
import { stripVTControlCharacters } from 'node:util'

import { counted } from '../counted.ts'
import { readStepCounts } from '../gate/step-counts.ts'
import {
	COMMAND_SEPARATORS,
	FAILING_TAIL_LINES,
	HOOK_LINE_PATTERNS,
	HOOK_WARNING_KINDS,
	NPM_COMMAND_LINE,
	NPM_RUN_SCRIPT,
	NPM_SCRIPT_HEADER,
	PARALLEL_FLAGS,
	PARALLEL_RUNNER,
	PLAIN_HOOK_STEP,
	RUN_ALL_RUNNERS,
	RUNNER_ARGUMENT,
	SCRIPT_FAILURE,
	SCRIPT_RUNNER,
} from './hook-output.constants.ts'

import type { StepCounts } from '../gate/gate.types.ts'
import type {
	FlaggedHookLine,
	HookLineKind,
	HookParentStep,
	HookStep,
	HookStepReader,
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
	const lines = output.split('\n')
	if (lines.at(-1) === '') lines.pop()
	const reader = createHookStepReader({})
	for (const line of lines) reader.read(line)
	return reader.end()
}

/**
 * Reads a hook's output a line at a time: `onStep` hears each step as its header is read (a script run in
 * parallel by its parent is none: its lines stay the parent's), `onFlagged` each warning or error line.
 */
export function createHookStepReader(params: {
	onStep?: (step: HookStep) => void
	onFlagged?: (flagged: FlaggedHookLine) => void
}): HookStepReader {
	const steps: HookStep[] = []
	const parents: HookParentStep[] = []
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
		if (kind) params.onFlagged?.({ line, kind })
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
 * (passed) or the error lines not among the failing step's last lines, then those lines (failed), then
 * the full log's path. The summary names the scripts the hook file runs, and a script they run only when it has
 * counts or is the one that failed.
 */
export function hookOutcomeLines(params: {
	output: string
	passed: boolean
	logPath: string
}): string[] {
	const steps = readHookSteps(params.output)
	const failing = params.passed ? undefined : steps.at(-1)
	const failed = failingChain({ steps, failing })
	const parts: string[] = []
	for (const step of steps) {
		const counts = step.runsScripts ? '' : renderHookCounts(readStepCounts(step.lines.join('\n')))
		const stepFailed = failed.has(step)
		if (step.parent && !counts && !stepFailed) continue
		parts.push(`${step.name} ${stepFailed ? '✗' : '✓'}${counts ? ` ${counts}` : ''}`)
		if (step === failing) for (const task of failedTasks(step.lines)) parts.push(`${task} ✗`)
	}
	const logLine = `full log: ${params.logPath}`
	if (!failing) {
		const flagged = steps.flatMap((step) => flaggedLines(step.lines))
		return [
			[...parts, ...warningCounts(flagged)].join(' · '),
			...flagged.map((entry) => entry.line),
			logLine,
		]
	}
	const tailStart = Math.max(failing.lines.length - FAILING_TAIL_LINES, 0)
	const before = steps.flatMap((step) =>
		flaggedLines(step === failing ? step.lines.slice(0, tailStart) : step.lines),
	)
	return [
		parts.join(' · '),
		...before
			.filter((entry) => !HOOK_WARNING_KINDS.includes(entry.kind))
			.map((entry) => entry.line),
		...failing.lines.slice(tailStart),
		logLine,
	]
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

function flaggedLines(lines: readonly string[]): FlaggedHookLine[] {
	return lines.flatMap((line) => {
		const kind = classifyHookLine(line)
		return kind ? [{ line, kind }] : []
	})
}

/** Each kind of warning with its count, in the order first printed: `2 lint warnings`. */
function warningCounts(flagged: readonly FlaggedHookLine[]): string[] {
	const counts = new Map<HookLineKind, number>()
	for (const entry of flagged)
		if (HOOK_WARNING_KINDS.includes(entry.kind))
			counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1)
	return [...counts].map(([kind, count]) => counted({ count, noun: kind }))
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
