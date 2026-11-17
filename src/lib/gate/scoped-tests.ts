/**
 * The scoped `tests` step of this package's fast gate: runs the tests vitest's import graph has the changed paths of
 * the gate reach (the NUL-separated file in `DIALECTE_GATE_CHANGED`), leaving a change no test imports, and a file most
 * tests import, to the full suite on CI, and writes the selection file the gate reads. An empty selection exits 0 without starting vitest.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { counted } from '../counted.ts'
import { readGit } from '../git.ts'
import { textOf } from '../print/print.ts'
import { withoutVariables } from '../progress/run-child.ts'
import { makeScratchFolder } from '../scratch/make-scratch-folder.ts'
import { createModuleResolver } from '../tdd/module-resolver.ts'
import { resolvePackageVitest } from '../tdd/package-vitest.ts'
import { SERIAL_FLAG } from './gate-config.constants.ts'
import {
	IMPORTABLE_FILE_PATTERN,
	NOTHING_TO_RELATE_LINE,
	OUTPUT_MAX_BYTES,
	REPORT_FILE_NAME,
	REPORT_FOLDER_PREFIX,
	SCOPED_TESTS_DEPTH_VARIABLE,
	SCOPED_TESTS_SELECTION_ID,
	TEST_READ_FOLDER_PATTERN,
	VITEST_JSON_OUTPUT_OPTION,
	VITEST_REPORT_ARGUMENTS,
	GRAPH_FAILED_LINE,
	GRAPH_FILE_NAME,
	NO_TEST_REACHED_LINE,
	SHARED_FILE_FLOOR,
	SHARED_FILE_SHARE,
	SHARED_PATH_DIRECT_RAN_TEXT,
	SHARED_PATH_TEXT,
	TEST_GRAPH_SCRIPT,
	LEFT_TO_CI_FILE_PATTERN,
	LEFT_TO_CI_FILES,
	LEFT_TO_CI_LINE_START,
	LEFT_TO_CI_SELECTION_ID,
} from './scoped-tests.constants.ts'
import { GATE_SCOPE_VARIABLES, HANDOVER_VARIABLES } from './selection.constants.ts'
import { readChangedPaths, writeSelectionFile } from './selection.ts'

import type {
	ScopedTestsEnvironment,
	ScopedTestsRun,
	SharedPath,
	TestGraph,
} from './scoped-tests.types.ts'
import type { SpawnSyncReturns } from 'node:child_process'

/**
 * Runs the tests the gate's change can reach and writes its selection. A changed path no related run can follow (the
 * manifest, the entry, the vitest config, a file a test reads) is left to the full suite CI runs; so is the far reach
 * of a shared file, one vitest's import graph has more than a quarter of the package's test files reach (and more
 * than `SHARED_FILE_FLOOR`): its own tests, the test files importing it themselves, still run here, unless they too
 * are past that share (a hub helper goes to CI whole). Both said in one line and skipped in the selection. The test
 * files the other importable
 * changed paths reach run with `vitest run`; nothing, exit 0, when none does. The gate's serial rerun (its flag and the
 * failing files after the changed paths) runs those files alone.
 * @intent run on the machine only the tests a change reaches, the full suite being CI's
 */
export function runScopedTests(params: {
	/** The package root vitest runs from. */
	root: string
	environment: ScopedTestsEnvironment
	/** Added after the related paths: what the gate appends to a serial rerun (the failing files, its flag). */
	extraArguments?: readonly string[]
	/** How deep this run nests in scoped runs (`DIALECTE_SCOPED_TESTS_DEPTH`); 0 by default. */
	depth?: number
}): ScopedTestsRun {
	const { root, environment } = params
	const depth = params.depth ?? 0
	const changed = readChangedPaths(environment.changed)
	const packagePaths = packagePathsOf({ root, changed })
	const leftToCi = leftToCiPaths({ root, paths: packagePaths })
	// a path left to CI is never related here: every test depends on the manifest or a setup file
	const importable = importablePaths({ root, paths: packagePaths }).filter(
		(path) => !leftToCi.includes(path),
	)
	const extraArguments = params.extraArguments ?? []
	// the gate's serial rerun: its flag and the failing files (a step's own words never hold the flag)
	const rerun =
		extraArguments.includes(SERIAL_FLAG) &&
		extraArguments.some((argument) => !argument.startsWith('-'))
	if (!rerun && importable.length === 0 && extraArguments.length === 0)
		return nothingRun({
			environment,
			changed: changed.length,
			leftToCi,
			shared: [],
			// the left-to-CI line says it all when there is one
			line:
				leftToCi.length > 0
					? undefined
					: NOTHING_TO_RELATE_LINE.replace('{paths}', () =>
							counted({ count: changed.length, noun: 'path' }),
						),
		})
	const folder = makeScratchFolder({ purpose: REPORT_FOLDER_PREFIX, cwd: root })
	try {
		const reached = rerun
			? { testFiles: [], shared: [] }
			: reachedTestFiles({ root, folder, depth, paths: importable })
		if ('failure' in reached)
			return graphFailed({
				environment,
				changed: changed.length,
				leftToCi,
				failure: reached.failure,
			})
		const { shared } = reached
		if (!rerun && reached.testFiles.length === 0 && extraArguments.length === 0)
			return nothingRun({
				environment,
				changed: changed.length,
				leftToCi,
				shared,
				// every importable path shared: the left-to-CI line says it all
				line:
					importable.length === shared.length
						? undefined
						: NO_TEST_REACHED_LINE.replace('{paths}', () =>
								counted({ count: importable.length - shared.length, noun: 'path' }),
							),
			})
		const report = join(folder, REPORT_FILE_NAME)
		const run = spawnVitest({
			root,
			report,
			files: reached.testFiles,
			extraArguments,
			depth,
		})
		const testFiles = readReportedFiles({ root, report })
		writeSelectionFile({
			scope: environment,
			changed: changed.length,
			selected: testFiles.length ? [{ id: SCOPED_TESTS_SELECTION_ID, reasons: testFiles }] : [],
			skipped: skippedOf({ leftToCi, shared }),
		})
		return {
			exitCode: run.status ?? 1,
			output: `${leftLineOf({ leftToCi, shared })}${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? `${run.error.message}\n` : ''}`,
		}
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/** The graph could not be read: the step fails, what CI checks still named and the selection written. */
function graphFailed(params: {
	environment: ScopedTestsEnvironment
	changed: number
	leftToCi: readonly string[]
	failure: string
}): ScopedTestsRun {
	const { leftToCi } = params
	writeSelectionFile({
		scope: params.environment,
		changed: params.changed,
		selected: [],
		skipped: skippedOf({ leftToCi, shared: [] }),
	})
	return { exitCode: 1, output: `${leftLineOf({ leftToCi, shared: [] })}${params.failure}` }
}

/** No vitest started: the selection written with nothing selected; the left-to-CI line, then `line`, as the output. */
function nothingRun(params: {
	environment: ScopedTestsEnvironment
	changed: number
	leftToCi: readonly string[]
	shared: readonly SharedPath[]
	line: string | undefined
}): ScopedTestsRun {
	const { leftToCi, shared } = params
	writeSelectionFile({
		scope: params.environment,
		changed: params.changed,
		selected: [],
		skipped: skippedOf({ leftToCi, shared }),
	})
	return {
		exitCode: 0,
		output: `${leftLineOf({ leftToCi, shared })}${params.line === undefined ? '' : `${params.line}\n`}`,
	}
}

/** What the selection skips for CI: one `left-to-ci` entry naming the paths, none without. */
function skippedOf(params: {
	leftToCi: readonly string[]
	shared: readonly SharedPath[]
}): { id: string; reason: string }[] {
	const paths = [...params.leftToCi, ...params.shared.map((shared) => shared.path)]
	// skipped, never selected: a step that selects nothing passes; what CI checks stays named for the card and the record
	return paths.length > 0 ? [{ id: LEFT_TO_CI_SELECTION_ID, reason: paths.join(', ') }] : []
}

/** The one line naming what is left to CI (a shared path with how many test files reach it), empty without. */
function leftLineOf(params: {
	leftToCi: readonly string[]
	shared: readonly SharedPath[]
}): string {
	const named = [
		...params.leftToCi,
		...params.shared.map((shared) =>
			(shared.directRan ? SHARED_PATH_DIRECT_RAN_TEXT : SHARED_PATH_TEXT)
				.replace('{path}', () => shared.path)
				.replace('{related}', String(shared.related))
				.replace('{total}', String(shared.total))
				.replace('{direct}', String(shared.direct)),
		),
	]
	return named.length > 0 ? `${textOf([`${LEFT_TO_CI_LINE_START}${named.join(', ')}`])}\n` : ''
}

/**
 * The test files the changed `paths` reach in vitest's import graph (a test file reaches itself), and the shared
 * paths among them, which reach none here: a path more than `SHARED_FILE_SHARE` of the test files and more than
 * `SHARED_FILE_FLOOR` reach. The graph read by `test-graph.ts` with the package's vitest; its failure is the output.
 */
function reachedTestFiles(params: {
	root: string
	folder: string
	depth: number
	paths: readonly string[]
}): { testFiles: string[]; shared: SharedPath[] } | { failure: string } {
	const output = join(params.folder, GRAPH_FILE_NAME)
	const child = spawnSync(process.execPath, [TEST_GRAPH_SCRIPT, output], {
		cwd: params.root,
		encoding: 'utf8',
		maxBuffer: OUTPUT_MAX_BYTES,
		env: childEnvironment({ depth: params.depth }),
	})
	if (child.status !== 0 || !existsSync(output))
		return {
			failure: `${GRAPH_FAILED_LINE}\n${child.stdout ?? ''}${child.stderr ?? ''}${child.error ? `${child.error.message}\n` : ''}`,
		}
	const graph = JSON.parse(readFileSync(output, 'utf8')) as TestGraph
	const testFiles = Object.keys(graph.dependencies)
	const total = testFiles.length
	const shared: SharedPath[] = []
	const reached = new Set<string>()
	for (const path of params.paths) {
		const related = testFiles.filter(function reaches(file) {
			return file === path || graph.dependencies[file].includes(path)
		})
		if (!isPastShare({ count: related.length, total })) {
			for (const file of related) reached.add(file)
			continue
		}
		// its own tests (a test file importing it itself) run here, unless they are a hub's share themselves
		const direct = testFiles.filter(function imports(file) {
			return file === path || (graph.imports[file] ?? []).includes(path)
		})
		const directRan = direct.length > 0 && !isPastShare({ count: direct.length, total })
		if (directRan) for (const file of direct) reached.add(file)
		shared.push({ path, related: related.length, total, direct: direct.length, directRan })
	}
	return { testFiles: [...reached].sort(), shared }
}

/** Whether `count` test files of `total` are past the share and the floor: a run the machine leaves to CI. */
function isPastShare(params: { count: number; total: number }): boolean {
	return params.count > SHARED_FILE_FLOOR && params.count > SHARED_FILE_SHARE * params.total
}

/**
 * `vitest run` over `files` (then `extraArguments`: the gate's serial rerun names its failing files there), its JSON
 * report written to `report`.
 */
function spawnVitest(params: {
	root: string
	report: string
	files: readonly string[]
	extraArguments: readonly string[]
	depth: number
}): SpawnSyncReturns<string> {
	const vitest = resolvePackageVitest({ root: params.root })
	return spawnSync(
		vitest.command,
		[
			...vitest.arguments,
			...VITEST_REPORT_ARGUMENTS,
			VITEST_JSON_OUTPUT_OPTION.replace('{file}', params.report),
			// absolute under the root's real path (vitest's own root): a relative filter matches as a substring
			...params.files.map((file) => resolve(realpathSync(params.root), file)),
			...params.extraArguments,
		],
		{
			cwd: params.root,
			encoding: 'utf8',
			maxBuffer: OUTPUT_MAX_BYTES,
			env: childEnvironment({ depth: params.depth }),
		},
	)
}

/**
 * The environment of the vitest a scoped run starts: never the gate's variables (a test reading them would read this
 * run's), and the nesting depth one deeper (an entry they start again refuses at the second level).
 */
function childEnvironment(params: { depth: number }): NodeJS.ProcessEnv {
	return {
		...withoutVariables({
			names: [...Object.values(GATE_SCOPE_VARIABLES), ...HANDOVER_VARIABLES],
		}),
		[SCOPED_TESTS_DEPTH_VARIABLE]: String(params.depth + 1),
	}
}

/** The changed paths of the package, as it names them (the list names paths from the repository's top). */
function packagePathsOf(params: { root: string; changed: readonly string[] }): string[] {
	const prefix = readGit({ root: params.root, args: ['rev-parse', '--show-prefix'] }).trim()
	return params.changed
		.filter((path) => path.startsWith(prefix))
		.map((path) => path.slice(prefix.length))
}

/**
 * The paths whose change no import graph can follow, left to the full suite on CI: the manifest, a lockfile, the vitest config, the cli's
 * entry, a setup file (named by the config, or by its `*.setup.*` name: a global setup), and a file at the package
 * root or under `src/` or `test/` no test can import (a README, a CHANGELOG, a note a test reads). A deleted one
 * counts too. A file in another folder (`docs/`) asks for nothing.
 */
function leftToCiPaths(params: { root: string; paths: readonly string[] }): string[] {
	const setupFiles = createModuleResolver({ root: params.root }).setupFiles
	return params.paths.filter(
		(path) =>
			LEFT_TO_CI_FILES.includes(path) ||
			LEFT_TO_CI_FILE_PATTERN.test(path) ||
			setupFiles.includes(path) ||
			(TEST_READ_FOLDER_PATTERN.test(path) && !IMPORTABLE_FILE_PATTERN.test(path)),
	)
}

/** Of the package's changed paths, those a test can import, still on disk: a deleted one relates to nothing. */
function importablePaths(params: { root: string; paths: readonly string[] }): string[] {
	return params.paths.filter(
		(path) => IMPORTABLE_FILE_PATTERN.test(path) && existsSync(resolve(params.root, path)),
	)
}

/** The test files vitest's JSON report names, relative to the package root, sorted; none without a report. */
function readReportedFiles(params: { root: string; report: string }): string[] {
	if (!existsSync(params.report)) return []
	const parsed: unknown = JSON.parse(readFileSync(params.report, 'utf8'))
	const results =
		typeof parsed === 'object' && parsed !== null && 'testResults' in parsed
			? parsed.testResults
			: []
	if (!Array.isArray(results)) return []
	const root = realpathSync(params.root)
	const list: unknown[] = results
	return list
		.flatMap((result) =>
			typeof result === 'object' &&
			result !== null &&
			'name' in result &&
			typeof result.name === 'string'
				? [relative(root, realPathOrSelf(result.name))]
				: [],
		)
		.sort()
}

/** The real path of a file, or the path itself when it is gone. */
function realPathOrSelf(path: string): string {
	try {
		return realpathSync(path)
	} catch {
		return path
	}
}
