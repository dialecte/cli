/**
 * Runs the pytest test files of a package through the cli's pytest plugin (`dialecte_tdd_pytest.py`, next to this
 * file or to the built cli): one run per pytest folder, from that folder so its configuration, conftests and
 * rootdir apply as the package's own runs apply them, with the folder's python (`resolvePython`). No bytecode and
 * no cache folder are written. The plugin keeps the cases of the names asked (exact names, no pattern), or lists the
 * cases and runs none (`--collect-only`).
 */
import { realpathSync } from 'node:fs'
import { delimiter, dirname, join, relative } from 'node:path'

import { resolvePython, resolvePytestFolder } from './package-python.ts'
import { reporterPath, runReportingChild } from './run-reporting-child.ts'
import {
	NO_PYTEST_FAILURE,
	NO_PYTEST_PATTERN,
	PYTEST_ARGUMENTS,
	PYTEST_COLLECT_ARGUMENT,
	PYTEST_NAMES_VARIABLE,
	PYTEST_PLUGIN_FILE_NAMES,
	PYTEST_ROOT_VARIABLE,
	PYTHON_NO_BYTECODE_VARIABLE,
	PYTHON_PATH_VARIABLE,
} from './tdd.constants.ts'

import type { PackagePython, ReportedModule, RunnerParams, TestRunFailure } from './tdd.types.ts'

/**
 * Runs the pytest test files of a package through the cli's pytest plugin, one run per pytest folder, and answers
 * what the runs saw: the cases with their states, locations, errors and sources, the files' dependencies.
 */
export async function runPytestCases(
	params: RunnerParams,
): Promise<ReportedModule[] | TestRunFailure> {
	const modules: ReportedModule[] = []
	for (const [folder, files] of filesByFolder(params)) {
		const python = resolvePython({ root: params.root, folder })
		const reported = await runPytestFolder({ params, folder, files, python })
		if ('failure' in reported) return reported
		modules.push(...reported)
	}
	return modules
}

/** The test files grouped by their pytest folder, the folders in the order of their first file. */
function filesByFolder(params: { root: string; files: readonly string[] }): Map<string, string[]> {
	const groups = new Map<string, string[]>()
	for (const file of params.files) {
		const folder = resolvePytestFolder({ root: params.root, file })
		groups.set(folder, [...(groups.get(folder) ?? []), file])
	}
	return groups
}

/** One pytest run of a folder's files; a python with no pytest answers a failure naming the folder. */
async function runPytestFolder(params: {
	params: RunnerParams
	folder: string
	files: readonly string[]
	python: PackagePython
}): Promise<ReportedModule[] | TestRunFailure> {
	const { folder, python } = params
	const run = params.params
	const { filter } = run
	const pluginFolder = dirname(reporterPath(PYTEST_PLUGIN_FILE_NAMES))
	const inheritedPath = process.env[PYTHON_PATH_VARIABLE]
	const reported = await runReportingChild({
		runner: 'pytest',
		command: python.command,
		args: [
			...python.arguments,
			...PYTEST_ARGUMENTS,
			...(filter === 'collect' ? [PYTEST_COLLECT_ARGUMENT] : []),
			...params.files.map((file) => relative(folder, join(run.root, file))),
		],
		environment: {
			[PYTHON_PATH_VARIABLE]: inheritedPath
				? `${pluginFolder}${delimiter}${inheritedPath}`
				: pluginFolder,
			[PYTHON_NO_BYTECODE_VARIABLE]: '1',
			[PYTEST_ROOT_VARIABLE]: realpathSync.native(run.root),
			...(typeof filter === 'object' && { [PYTEST_NAMES_VARIABLE]: JSON.stringify(filter.names) }),
		},
		cwd: folder,
		run,
	})
	if (!('failure' in reported)) return reported
	const missing = reported.tail?.find((line) => NO_PYTEST_PATTERN.test(line))
	if (missing === undefined) return reported
	return {
		...reported,
		failure: NO_PYTEST_FAILURE.replace('{folder}', () =>
			folderLabel({ root: run.root, folder }),
		).replace('{reason}', () => `${python.command}: ${missing.trim()}`),
	}
}

/** The pytest folder relative to the package root, with a trailing `/` (`./` for the root itself). */
function folderLabel(params: { root: string; folder: string }): string {
	return `${relative(params.root, params.folder) || '.'}/`
}
