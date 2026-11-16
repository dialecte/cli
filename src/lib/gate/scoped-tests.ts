/**
 * The scoped `tests` step of this package's fast gate: runs `vitest related` over the changed paths of the gate
 * (the NUL-separated file in `DIALECTE_GATE_CHANGED`), leaving a change no test imports to the full suite on CI, and
 * writes the selection file the gate reads. An empty selection exits 0 without starting vitest.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

import { counted } from '../counted.ts'
import { readGit } from '../git.ts'
import { textOf } from '../print/print.ts'
import { withoutVariables } from '../progress/run-child.ts'
import { createModuleResolver } from '../tdd/module-resolver.ts'
import { resolvePackageVitest } from '../tdd/package-vitest.ts'
import { VITEST_RUN_ARGUMENT } from '../tdd/tdd.constants.ts'
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
	VITEST_RELATED_ARGUMENTS,
	VITEST_REPORT_ARGUMENTS,
	LEFT_TO_CI_FILE_PATTERN,
	LEFT_TO_CI_FILES,
	LEFT_TO_CI_LINE_START,
	LEFT_TO_CI_SELECTION_ID,
} from './scoped-tests.constants.ts'
import { GATE_SCOPE_VARIABLES, HANDOVER_VARIABLES } from './selection.constants.ts'
import { readChangedPaths, writeSelectionFile } from './selection.ts'

import type { ScopedTestsEnvironment, ScopedTestsRun } from './scoped-tests.types.ts'
import type { SpawnSyncReturns } from 'node:child_process'

/**
 * Runs the tests the gate's change can reach and writes its selection: `vitest related` over the importable changed
 * paths; a changed path no related run can follow (`wholeSuitePaths`: the manifest, the entry, the vitest config, a
 * file a test reads) is left to the full suite CI runs, said in one line and named in the selection; nothing, exit 0,
 * when no test is related.
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
	const changed = readChangedPaths(environment.changed)
	const packagePaths = packagePathsOf({ root, changed })
	const leftToCi = leftToCiPaths({ root, paths: packagePaths })
	// a path left to CI is never related here: `vitest related` on the manifest or a setup file runs every test
	const importable = importablePaths({ root, paths: packagePaths }).filter(
		(path) => !leftToCi.includes(path),
	)
	const extraArguments = params.extraArguments ?? []
	const leftLine =
		leftToCi.length > 0 ? `${textOf([`${LEFT_TO_CI_LINE_START}${leftToCi.join(', ')}`])}\n` : ''
	// skipped, never selected: a step that selects nothing passes; what CI checks stays named for the card and the record
	const skipped =
		leftToCi.length > 0 ? [{ id: LEFT_TO_CI_SELECTION_ID, reason: leftToCi.join(', ') }] : []
	if (importable.length === 0 && extraArguments.length === 0) {
		writeSelectionFile({ scope: environment, changed: changed.length, selected: [], skipped })
		return {
			exitCode: 0,
			output:
				leftLine ||
				NOTHING_TO_RELATE_LINE.replace('{paths}', counted({ count: changed.length, noun: 'path' })),
		}
	}
	const folder = mkdtempSync(join(tmpdir(), REPORT_FOLDER_PREFIX))
	try {
		const report = join(folder, REPORT_FILE_NAME)
		const run = spawnRelated({
			root,
			report,
			related: importable,
			extraArguments,
			depth: params.depth ?? 0,
		})
		const testFiles = readReportedFiles({ root, report })
		writeSelectionFile({
			scope: environment,
			changed: changed.length,
			selected: testFiles.length ? [{ id: SCOPED_TESTS_SELECTION_ID, reasons: testFiles }] : [],
			skipped,
		})
		return {
			exitCode: run.status ?? 1,
			output: `${leftLine}${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? `${run.error.message}\n` : ''}`,
		}
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/**
 * `vitest related` over `related` (then `extraArguments`), its JSON report written to `report`; the gate's serial rerun
 * (`extraArguments` naming the failing test files) runs those files alone with `vitest run`, never every related one.
 */
function spawnRelated(params: {
	root: string
	report: string
	related: readonly string[]
	extraArguments: readonly string[]
	depth: number
}): SpawnSyncReturns<string> {
	const vitest = resolvePackageVitest({ root: params.root })
	// the gate's serial rerun: its flag and the failing files (a step's own words never hold the flag)
	const rerun =
		params.extraArguments.includes(SERIAL_FLAG) &&
		params.extraArguments.some((argument) => !argument.startsWith('-'))
	return spawnSync(
		vitest.command,
		[
			...(rerun
				? [...vitest.arguments, ...VITEST_REPORT_ARGUMENTS]
				: [
						...vitest.arguments.filter((argument) => argument !== VITEST_RUN_ARGUMENT),
						...VITEST_RELATED_ARGUMENTS,
					]),
			VITEST_JSON_OUTPUT_OPTION.replace('{file}', params.report),
			...(rerun ? [] : params.related),
			...params.extraArguments,
		],
		{
			cwd: params.root,
			encoding: 'utf8',
			maxBuffer: OUTPUT_MAX_BYTES,
			// the tests never see the gate's variables: a test reading them would read this run's
			// and they carry the nesting depth one deeper: an entry they start again refuses at the second level
			env: {
				...withoutVariables({
					names: [...Object.values(GATE_SCOPE_VARIABLES), ...HANDOVER_VARIABLES],
				}),
				[SCOPED_TESTS_DEPTH_VARIABLE]: String(params.depth + 1),
			},
		},
	)
}

/** The changed paths of the package, as it names them (the list names paths from the repository's top). */
function packagePathsOf(params: { root: string; changed: readonly string[] }): string[] {
	const prefix = readGit({ root: params.root, args: ['rev-parse', '--show-prefix'] }).trim()
	return params.changed
		.filter((path) => path.startsWith(prefix))
		.map((path) => path.slice(prefix.length))
}

/**
 * The paths whose change no `vitest related` can follow, left to the full suite on CI: the manifest, a lockfile, the vitest config, the cli's
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
