/**
 * Runs the pytest test files of a package through the cli's pytest plugin (`dialecte_tdd_pytest.py`, next to this
 * file or to the built cli): one run per pytest folder, from that folder so its configuration, conftests and
 * rootdir apply as the package's own runs apply them, with the folder's python (`resolvePython`). No bytecode and
 * no cache folder are written. A base copy's run (`interpreterRoot`) takes the lot's python (`resolveLotPython`),
 * puts the copy's folder first on `sys.path` before pytest is imported (`BASE_COPY_PYTEST_ARGUMENTS`), and is refused when the package is installed
 * editable there (`isInstalledEditable`): its imports would reach the lot's code. The plugin keeps the cases of the names asked (exact names, no pattern), or lists the
 * cases and runs none (`--collect-only`).
 */
import { realpathSync } from 'node:fs'
import { delimiter, dirname, join, relative } from 'node:path'

import {
	isInstalledEditable,
	resolveLotPython,
	resolvePython,
	resolvePytestFolder,
} from './package-python.ts'
import { reporterPath, runReportingChild } from './run-reporting-child.ts'
import {
	BASE_COPY_PYTEST_ARGUMENTS,
	INSTALLED_EDITABLE,
	NO_PYTEST_FAILURE,
	NO_PYTEST_PATTERN,
	PYTEST_ARGUMENTS,
	PYTEST_BASE_TEXTS_VARIABLE,
	PYTEST_COLLECT_ARGUMENT,
	PYTEST_NAMES_VARIABLE,
	PYTEST_OWN_CODE_VARIABLE,
	PYTEST_PLUGIN_FILE_NAMES,
	PYTEST_ROOT_VARIABLE,
	PYTHON_NO_BYTECODE_VARIABLE,
	PYTHON_PATH_VARIABLE,
	PYTEST_MODULE_ARGUMENTS,
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
	const { interpreterRoot } = params
	for (const [folder, files] of filesByFolder(params)) {
		// a base copy: the lot's interpreter (the copy has no .venv), never one importing the lot's own code
		const lotFolder =
			interpreterRoot === undefined
				? undefined
				: join(interpreterRoot, relative(params.root, folder))
		const python =
			lotFolder === undefined ? resolvePython({ folder }) : resolveLotPython({ lotFolder })
		if (
			interpreterRoot !== undefined &&
			lotFolder !== undefined &&
			(await isInstalledEditable({ python, lotFolder, lotRoot: interpreterRoot }))
		)
			return { failure: INSTALLED_EDITABLE }
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
	// a base copy's run: its folder first on sys.path, set before pytest is imported whatever the python's version
	// (BASE_COPY_PYTEST_ARGUMENTS), and first on PYTHONPATH for the processes its tests start
	const copyFirst = run.interpreterRoot !== undefined
	const importPath = [
		...(copyFirst ? [folder] : []),
		pluginFolder,
		...(process.env[PYTHON_PATH_VARIABLE] ? [process.env[PYTHON_PATH_VARIABLE]] : []),
	].join(delimiter)
	const reported = await runReportingChild({
		runner: 'pytest',
		command: python.command,
		args: [
			...python.arguments,
			...(copyFirst ? [...BASE_COPY_PYTEST_ARGUMENTS, folder] : PYTEST_MODULE_ARGUMENTS),
			...PYTEST_ARGUMENTS,
			...(filter === 'collect' ? [PYTEST_COLLECT_ARGUMENT] : []),
			...params.files.map((file) => relative(folder, join(run.root, file))),
		],
		environment: {
			[PYTHON_PATH_VARIABLE]: importPath,
			[PYTHON_NO_BYTECODE_VARIABLE]: '1',
			[PYTEST_ROOT_VARIABLE]: realpathSync.native(run.root),
			...(typeof filter === 'object' && { [PYTEST_NAMES_VARIABLE]: JSON.stringify(filter.names) }),
			...(run.ownCode && { [PYTEST_OWN_CODE_VARIABLE]: '1' }),
		},
		cwd: folder,
		// the base texts of the folder's files: the plugin reads their own code too
		...(run.baseTexts && {
			inputs: {
				[PYTEST_BASE_TEXTS_VARIABLE]: Object.fromEntries(
					Object.entries(run.baseTexts).filter(([file]) => params.files.includes(file)),
				),
			},
		}),
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
