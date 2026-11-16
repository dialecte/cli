/**
 * The `node --test` reporter `dialecte tdd` runs a package's node tests with: at the end of the run it writes every
 * test file it saw - its error at load (a missing export, a throwing describe) and each case with its full name,
 * state, location and errors - as JSON to the file `DIALECTE_TDD_REPORT` names. Loaded by node from the cli's own
 * folder: it imports nothing but node's own modules and the cli's constants (bundled into it when built).
 */
import { writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import {
	CASE_NAME_SEPARATOR,
	NODE_CODE_FAILURE,
	NODE_EVENT_TYPES,
	NODE_INTERNAL_FRAME_PREFIX,
	NODE_TEST_EVENT_TYPES,
	NODE_TIMEOUT_BOUND_PATTERN,
	NODE_TIMEOUT_FAILURE,
	NODE_TIMEOUT_MESSAGE,
	REPORT_ENVIRONMENT_VARIABLE,
	V8_FRAME_PATTERN,
} from './tdd.constants.ts'

import type { NodeTestError, NodeTestEvent, NodeTestEventData } from './tdd-node-reporter.types.ts'
import type { ErrorFrame, ReportedCaseState, ReportedError, ReportedModule } from './tdd.types.ts'

/** The test files of a run of events, with their cases and errors, in the order the files first appear. */
export function readNodeEvents(events: readonly NodeTestEvent[]): ReportedModule[] {
	const printed = stderrByFile(events)
	return [...eventsByFile(events)].map(function moduleOf([file, fileEvents]) {
		return readFileEvents({ file, events: fileEvents, printed: printed.get(file) ?? '' })
	})
}

/** The reporter node loads: nothing is yielded, the report is written once the run has ended. */
export default async function* tddNodeReporter(
	source: AsyncIterable<NodeTestEvent>,
): AsyncGenerator<never, void> {
	const events: NodeTestEvent[] = []
	for await (const event of source) events.push(event)
	const path = process.env[REPORT_ENVIRONMENT_VARIABLE]
	if (path) writeFileSync(path, JSON.stringify(readNodeEvents(events)))
	yield* []
}

/**
 * What each file's process printed on its error output, by the file's absolute path: node 26 names it
 * (`entryFile`), node 22 and 24 give the path as on the command line only, relative to the run's folder.
 */
function stderrByFile(events: readonly NodeTestEvent[]): Map<string, string> {
	const printed = new Map<string, string>()
	for (const { type, data } of events) {
		if (type !== NODE_EVENT_TYPES.stderr || data.message === undefined) continue
		const path = data.entryFile ?? (data.file === undefined ? undefined : resolve(data.file))
		if (path !== undefined) printed.set(path, `${printed.get(path) ?? ''}${data.message}`)
	}
	return printed
}

/** The start and end events of the tests and suites of each file, in order, the files in the order they first appear. */
function eventsByFile(events: readonly NodeTestEvent[]): Map<string, NodeTestEvent[]> {
	const byFile = new Map<string, NodeTestEvent[]>()
	for (const event of events) {
		const { file } = event.data
		if (file === undefined || event.data.nesting === undefined) continue
		if (!NODE_TEST_EVENT_TYPES.includes(event.type)) continue
		const known = byFile.get(file)
		if (known) known.push(event)
		else byFile.set(file, [event])
	}
	return byFile
}

/** One file's events read in order: a start opens a title, an end records a case or an error of the file. */
function readFileEvents(params: {
	file: string
	events: readonly NodeTestEvent[]
	printed: string
}): ReportedModule {
	const { file } = params
	const testModule: ReportedModule = { file, runner: 'node', errors: [], cases: [] }
	/** By nesting: the titles of the tests and suites started, and how many cases the file had when each started. */
	const titles: string[] = []
	const casesAtStart: number[] = []
	for (const { type, data } of params.events) {
		const nesting = data.nesting ?? 0
		if (type === NODE_EVENT_TYPES.start) {
			titles.splice(nesting, titles.length, data.name ?? '')
			casesAtStart.splice(nesting, casesAtStart.length, testModule.cases.length)
			continue
		}
		const failed = type === NODE_EVENT_TYPES.fail
		const error = data.details?.error
		if (isFileTest({ data, file })) {
			if (failed) testModule.errors.push(loadError({ printed: params.printed, error }))
			continue
		}
		if (data.details?.type === 'suite') {
			// a suite whose own code threw and that holds no case: the file's cases cannot be listed
			const casesUnder = testModule.cases.length - (casesAtStart[nesting] ?? 0)
			if (failed && error?.failureType === NODE_CODE_FAILURE && casesUnder === 0)
				testModule.errors.push(reportError(error))
			continue
		}
		testModule.cases.push({
			name: [...titles.slice(0, nesting), data.name ?? ''].join(CASE_NAME_SEPARATOR),
			state: caseStateOf({ data, failed }),
			project: '',
			...(data.line !== undefined &&
				data.column !== undefined && { location: { line: data.line, column: data.column } }),
			errors: failed && error ? [reportError(error)] : [],
		})
	}
	return testModule
}

/** The test a file itself is (node runs each file as a test named by its path as given): never a case. */
function isFileTest(params: { data: NodeTestEventData; file: string }): boolean {
	const { data, file } = params
	if (data.nesting !== 0 || data.details?.type !== 'test' || data.name === undefined) return false
	return file === data.name || file.endsWith(`${sep}${data.name}`) || resolve(data.name) === file
}

/** A file that failed to load: what its process printed (the import's error is only there), else node's own error. */
function loadError(params: { printed: string; error: NodeTestError | undefined }): ReportedError {
	const { printed, error } = params
	if (printed.trim() !== '') return { message: printed, frames: [] }
	return error ? reportError(error) : { message: '', frames: [] }
}

function caseStateOf(params: { data: NodeTestEventData; failed: boolean }): ReportedCaseState {
	const { data } = params
	if (data.todo) return 'pending'
	if (data.skip) return 'skipped'
	return params.failed ? 'failed' : 'passed'
}

/** The real error of a failure (node's `cause`), its message worded as vitest's for a timeout, its stack parsed. */
function reportError(error: NodeTestError): ReportedError {
	const { cause } = error
	const message = typeof cause === 'string' ? cause : (cause?.message ?? error.message ?? '')
	const name = typeof cause === 'object' ? cause.name : undefined
	const code = typeof cause === 'object' ? cause.code : undefined
	const stack = typeof cause === 'object' ? cause.stack : undefined
	return {
		...(name && { name }),
		...(typeof code === 'string' && { code }),
		message: error.failureType === NODE_TIMEOUT_FAILURE ? timeoutMessage(message) : message,
		frames: stack === undefined ? [] : framesOf(stack),
	}
}

/** `test timed out after 10ms` as `Test timed out in 10ms`. */
function timeoutMessage(message: string): string {
	const bound = NODE_TIMEOUT_BOUND_PATTERN.exec(message)?.[1] ?? '0'
	return NODE_TIMEOUT_MESSAGE.replace('{ms}', bound)
}

/** The frames of a V8 stack, innermost first, node's own left out. */
function framesOf(stack: string): ErrorFrame[] {
	return stack.split('\n').flatMap(function frameOf(line) {
		const matched = V8_FRAME_PATTERN.exec(line)
		if (!matched || matched[1].startsWith(NODE_INTERNAL_FRAME_PREFIX)) return []
		return [{ file: matched[1], line: Number(matched[2]), column: Number(matched[3]) }]
	})
}
