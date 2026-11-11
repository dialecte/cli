/**
 * The scoped `tests` step of this package's fast gate: runs `vitest related` over the changed paths of the gate
 * (the NUL-separated file in `DIALECTE_GATE_CHANGED`), or the whole suite for a change no test imports, and writes the
 * selection file the gate reads. An empty selection exits 0 without starting vitest.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { counted } from '../counted.ts'
import { readGit } from '../git.ts'
import { textOf } from '../print/print.ts'
import { withoutVariables } from '../progress/run-child.ts'
import { createModuleResolver } from '../tdd/module-resolver.ts'
import { resolvePackageVitest } from '../tdd/package-vitest.ts'
import { VITEST_RUN_ARGUMENT } from '../tdd/tdd.constants.ts'
import {
	CLI_ENTRY_REFERENCE_PATTERN,
	IMPORTABLE_FILE_PATTERN,
	NODE_MODULES_FOLDER,
	NOTHING_TO_RELATE_LINE,
	OUTPUT_MAX_BYTES,
	REPORT_FILE_NAME,
	REPORT_FOLDER_PREFIX,
	RELATIVE_IMPORT_PATTERN,
	SCOPED_TESTS_DEPTH_VARIABLE,
	SCOPED_TESTS_SELECTION_ID,
	SPAWNING_TESTS_SELECTION_ID,
	TEST_FILE_PATTERN,
	TEST_FOLDERS,
	TEST_READ_FOLDER_PATTERN,
	VITEST_JSON_OUTPUT_OPTION,
	VITEST_RELATED_ARGUMENTS,
	VITEST_REPORT_ARGUMENTS,
	WHOLE_SUITE_FILE_PATTERN,
	WHOLE_SUITE_FILES,
	WHOLE_SUITE_LINE,
	WHOLE_SUITE_SELECTION_ID,
} from './scoped-tests.constants.ts'
import { GATE_SCOPE_VARIABLES, HANDOVER_VARIABLES } from './selection.constants.ts'
import { readChangedPaths, writeSelectionFile } from './selection.ts'

import type { ScopedTestsEnvironment, ScopedTestsRun } from './scoped-tests.types.ts'

/**
 * Runs the tests the gate's change can reach and writes its selection: the whole suite when a changed path is one no
 * related run can follow (`wholeSuitePaths`), the selection naming those paths; else `vitest related` over the
 * importable changed paths; nothing, exit 0, when there is none. Output is vitest's, unfiltered.
 * @intent run only the tests a change reaches, run the whole suite for a change no test imports
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
	const changed = readChangedPaths(environment.changed)
	const packagePaths = packagePathsOf({ root, changed })
	const forcing = wholeSuitePaths({ root, paths: packagePaths })
	const importable = importablePaths({ root, paths: packagePaths })
	// a test that spawns the cli entry imports nothing it runs: any production change under src/ adds it
	const spawning = importable.some(isProductionSource) ? listSpawningTests({ root }) : []
	const related = [...importable, ...spawning.filter((file) => !importable.includes(file))]
	const extraArguments = params.extraArguments ?? []
	if (forcing.length === 0 && related.length === 0 && extraArguments.length === 0) {
		writeSelectionFile({ scope: environment, changed: changed.length, selected: [] })
		return {
			exitCode: 0,
			output: NOTHING_TO_RELATE_LINE.replace(
				'{paths}',
				counted({ count: changed.length, noun: 'path' }),
			),
		}
	}
	const folder = mkdtempSync(join(tmpdir(), REPORT_FOLDER_PREFIX))
	try {
		const report = join(folder, REPORT_FILE_NAME)
		const vitest = resolvePackageVitest({ root })
		const whole = forcing.length > 0
		const run = spawnSync(
			vitest.command,
			[
				...(whole
					? vitest.arguments
					: vitest.arguments.filter((argument) => argument !== VITEST_RUN_ARGUMENT)),
				...(whole ? VITEST_REPORT_ARGUMENTS : VITEST_RELATED_ARGUMENTS),
				VITEST_JSON_OUTPUT_OPTION.replace('{file}', report),
				...(whole ? [] : related),
				...extraArguments,
			],
			{
				cwd: root,
				encoding: 'utf8',
				maxBuffer: OUTPUT_MAX_BYTES,
				// the tests never see the gate's variables: a test reading them would read this run's
				// and they carry the nesting depth one deeper: an entry they start again refuses at the second level
				env: {
					...withoutVariables({
						names: [...Object.values(GATE_SCOPE_VARIABLES), ...HANDOVER_VARIABLES],
					}),
					[SCOPED_TESTS_DEPTH_VARIABLE]: String((params.depth ?? 0) + 1),
				},
			},
		)
		const testFiles = readReportedFiles({ root, report })
		writeSelectionFile({
			scope: environment,
			changed: changed.length,
			selected: whole
				? [{ id: WHOLE_SUITE_SELECTION_ID, reasons: forcing }]
				: [
						...(testFiles.length ? [{ id: SCOPED_TESTS_SELECTION_ID, reasons: testFiles }] : []),
						...(spawning.length ? [{ id: SPAWNING_TESTS_SELECTION_ID, reasons: spawning }] : []),
					],
		})
		const said = whole
			? `${textOf([WHOLE_SUITE_LINE.replace('{paths}', forcing.join(', '))])}\n`
			: ''
		return {
			exitCode: run.status ?? 1,
			output: `${said}${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? `${run.error.message}\n` : ''}`,
		}
	} finally {
		rmSync(folder, { recursive: true, force: true })
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
 * The paths whose change no `vitest related` can follow: the manifest, a lockfile, the vitest config, the cli's
 * entry, a setup file (named by the config, or by its `*.setup.*` name: a global setup), and a file at the package
 * root or under `src/` or `test/` no test can import (a README, a CHANGELOG, a note a test reads). A deleted one
 * counts too. A file in another folder (`docs/`) asks for nothing.
 */
function wholeSuitePaths(params: { root: string; paths: readonly string[] }): string[] {
	const setupFiles = createModuleResolver({ root: params.root }).setupFiles
	return params.paths.filter(
		(path) =>
			WHOLE_SUITE_FILES.includes(path) ||
			WHOLE_SUITE_FILE_PATTERN.test(path) ||
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

/** A production source under `src/`: an importable file that is no test. */
function isProductionSource(path: string): boolean {
	return path.startsWith(`${TEST_FOLDERS[0]}/`) && !TEST_FILE_PATTERN.test(path)
}

/**
 * The test files of the package (under `src/` and `test/`) that spawn the cli entry: their text names it, or a module
 * they import relatively does. Read from the files, sorted, relative to the package root.
 */
function listSpawningTests(params: { root: string }): string[] {
	const { root } = params
	const known = new Map<string, boolean>()
	/** Whether the file at `path` names the cli entry, read once. */
	function namesEntry(path: string): boolean {
		const found = known.get(path)
		if (found !== undefined) return found
		let text = ''
		try {
			text = readFileSync(path, 'utf8')
		} catch {
			// a module that does not read names nothing
		}
		const names = CLI_ENTRY_REFERENCE_PATTERN.test(text)
		known.set(path, names)
		return names
	}
	return listTestFiles({ root })
		.filter(function spawnsEntry(file) {
			const path = resolve(root, file)
			if (namesEntry(path)) return true
			const text = readFileSync(path, 'utf8')
			return [...text.matchAll(RELATIVE_IMPORT_PATTERN)].some(([, specifier]) =>
				namesEntry(resolve(dirname(path), specifier)),
			)
		})
		.sort()
}

/** The test files under the package's `src/` and `test/`, relative to its root (`node_modules` never read). */
function listTestFiles(params: { root: string }): string[] {
	return TEST_FOLDERS.flatMap(function filesOf(folder) {
		const absolute = join(params.root, folder)
		if (!existsSync(absolute)) return []
		return readdirSync(absolute, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile() && TEST_FILE_PATTERN.test(entry.name))
			.map((entry) => relative(params.root, join(entry.parentPath, entry.name)))
			.filter((file) => !file.split(sep).includes(NODE_MODULES_FOLDER))
	})
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
