/**
 * What a vitest run's output names: the files it failed (the paths a serial rerun is handed), the test keys and cases
 * it failed, and the test keys it ran. A test key is `|<project>| <file>`, or `<file>` for vitest's default project,
 * so a failure of one project is never taken for a run of another.
 */
import {
	FAILING_CASE_PATTERN,
	FAILING_FILE_PATTERN,
	RAN_MODULE_PATTERN,
	RETRY_MARKER_PATTERN,
	TASK_LOCATION_PATTERN,
	TEST_KEY_PROJECT_PATTERN,
} from './gate-config.constants.ts'

/** The files the output names as failing (`FAILING_FILE_PATTERN`), in its order, each once: a serial rerun's arguments. */
export function failingFilesOf(output: string): string[] {
	return [...new Set([...output.matchAll(FAILING_FILE_PATTERN)].map((match) => match[1]))]
}

/** The test keys the output's `FAIL` lines name, a collect failure's included, sorted, unique. */
export function failingKeysOf(output: string): string[] {
	return sortedUnique(
		[...output.matchAll(FAILING_CASE_PATTERN)].map(function keyOfMatch(match) {
			return testKeyOf({ project: match[1], file: match[2] })
		}),
	)
}

/** The cases the output's `FAIL <file> > <path>` lines name, each `<key> > <path>`, sorted, unique. */
export function failingCasesOf(output: string): string[] {
	return sortedUnique(
		[...output.matchAll(FAILING_CASE_PATTERN)].flatMap(function caseOfMatch(match) {
			const path = match[3]?.replace(RETRY_MARKER_PATTERN, '').trim()
			if (path === undefined || path === '') return []
			return [`${testKeyOf({ project: match[1], file: match[2] })} > ${path}`]
		}),
	)
}

/** The test keys of the modules the output's per-module lines name (passed, failed or skipped), sorted, unique. */
export function ranKeysOf(output: string): string[] {
	return sortedUnique(
		[...output.matchAll(RAN_MODULE_PATTERN)].map(function keyOfModule(match) {
			return testKeyOf({ project: match[1], file: match[2] })
		}),
	)
}

/** The file a test key names, without its project. */
export function fileOfTestKey(key: string): string {
	return key.replace(TEST_KEY_PROJECT_PATTERN, '')
}

/** `|<project>| <file>`, or `<file>` without a project; the file's task location dropped. */
function testKeyOf(params: { project: string | undefined; file: string }): string {
	const file = params.file.replace(TASK_LOCATION_PATTERN, '')
	const project = params.project?.trim()
	return project ? `|${project}| ${file}` : file
}

/** The distinct values, sorted. */
export function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort()
}
