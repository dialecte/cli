import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter, dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

import { walkedFolders } from './package-vitest.ts'
import { readPytestConfig } from './pytest-config.ts'
import { readToml } from './read-toml.ts'
import {
	DEFAULT_NORECURSEDIRS,
	DEFAULT_PYTHON_COMMAND,
	DEFAULT_PYTHON_FILES,
	DEFAULT_WINDOWS_PYTHON_COMMAND,
	EDITABLE_PROBE_ANSWER,
	EDITABLE_PROBE_SCRIPT,
	EDITABLE_PROBE_TIMEOUT,
	PROJECT_NAME_KEY,
	PYPROJECT_FILE,
	PYTEST_CONFIG_FILES,
	UV_LOCK_FILE,
	UV_PROJECT_OPTION,
	UV_PYTHON_COMMAND,
	VENV_PYTHON_PATH,
	VENV_WINDOWS_PYTHON_PATH,
} from './tdd.constants.ts'

import type { PackagePython, PytestConfig, PytestFolder } from './tdd.types.ts'

/** A child process run to its end without blocking the event loop (the running line stays live). */
const runFile = promisify(execFile)

/**
 * The folder a pytest test file runs from (absolute, spelled as `root` is): the nearest ancestor of the file, up to
 * the package root, holding a file that configures pytest (`readPytestConfig`: a `pytest.toml`, a `pytest.ini`, a
 * `pyproject.toml` with a pytest table, a `tox.ini` with `[pytest]`, a `setup.cfg` with `[tool:pytest]`...); the
 * package root when none does.
 */
export function resolvePytestFolder(params: { root: string; file: string }): string {
	return resolvePytestConfig(params).folder
}

/**
 * The file's pytest folder (`resolvePytestFolder`) with the configuration it holds: the first of its files, in the
 * order pytest looks for them, that configures pytest; pytest's defaults when none does.
 */
export function resolvePytestConfig(params: { root: string; file: string }): PytestFolder {
	const root = resolve(params.root)
	for (let folder = dirname(join(root, params.file)); ; folder = dirname(folder)) {
		const config = folderPytestConfig(folder)
		if (config) return { folder, config }
		if (folder === root || relative(root, folder).startsWith('..') || dirname(folder) === folder)
			return { folder: root, config: folderPytestConfig(root) ?? defaultPytestConfig() }
	}
}

/** The configuration the folder's first pytest configuration file holds; undefined when none configures pytest. */
function folderPytestConfig(folder: string): PytestConfig | undefined {
	for (const name of PYTEST_CONFIG_FILES) {
		const path = join(folder, name)
		if (!existsSync(path)) continue
		const config = readPytestConfig({ name, text: readFileSync(path, 'utf8') })
		if (config) return config
	}
	return undefined
}

/** pytest's discovery settings when no file configures it. */
function defaultPytestConfig(): PytestConfig {
	return {
		pythonFiles: [...DEFAULT_PYTHON_FILES],
		testpaths: [],
		norecursedirs: [...DEFAULT_NORECURSEDIRS],
	}
}

/**
 * The python a pytest folder runs with: `.venv/bin/python` from the folder up to the repository root (the first
 * found wins); else `uv run --frozen python` when a `uv.lock` is on that walk and `uv` is on the PATH; else
 * `python3`. `hasCommand` answers whether a command is on the PATH (default: the machine's). `platform` (default:
 * the machine's) picks the Windows spellings: `.venv\Scripts\python.exe`, and `python` in place of `python3`.
 */
export function resolvePython(params: {
	folder: string
	hasCommand?: (command: string) => boolean
	platform?: NodeJS.Platform
}): PackagePython {
	const windows = (params.platform ?? process.platform) === 'win32'
	const folders = walkedFolders({ root: params.folder })
	const venvPath = windows ? VENV_WINDOWS_PYTHON_PATH : VENV_PYTHON_PATH
	const venv = folders.map((folder) => join(folder, ...venvPath)).find((path) => existsSync(path))
	if (venv) return { command: venv, arguments: [] }
	const [uv, ...uvArguments] = UV_PYTHON_COMMAND
	const hasCommand = params.hasCommand ?? isOnPath
	if (folders.some((folder) => existsSync(join(folder, UV_LOCK_FILE))) && hasCommand(uv))
		return { command: uv, arguments: uvArguments }
	return {
		command: windows ? DEFAULT_WINDOWS_PYTHON_COMMAND : DEFAULT_PYTHON_COMMAND,
		arguments: [],
	}
}

/**
 * The python a pytest folder of a base copy runs with: the lot's own, resolved (`resolvePython`) from the same
 * folder of the lot's tree (its `.venv` is git-ignored, the copy has none), `uv run` pointed at the lot's project.
 */
export function resolveLotPython(params: { lotFolder: string }): PackagePython {
	const python = resolvePython({ folder: params.lotFolder })
	if (python.command !== UV_PYTHON_COMMAND[0]) return python
	return {
		command: python.command,
		arguments: [
			...python.arguments.slice(0, 1),
			UV_PROJECT_OPTION,
			params.lotFolder,
			...python.arguments.slice(1),
		],
	}
}

/**
 * The lot's package is installed editable in `python`: the project a `pyproject.toml` names (the nearest from
 * `lotFolder` up to `lotRoot`) has an editable distribution there. False when no project is named, or the probe
 * cannot run (the run itself then says why).
 */
export async function isInstalledEditable(params: {
	python: PackagePython
	lotFolder: string
	lotRoot: string
}): Promise<boolean> {
	const name = projectNameOf(params)
	if (name === undefined) return false
	try {
		const { stdout } = await runFile(
			params.python.command,
			[...params.python.arguments, '-c', EDITABLE_PROBE_SCRIPT, name],
			{ cwd: params.lotFolder, timeout: EDITABLE_PROBE_TIMEOUT, encoding: 'utf8' },
		)
		return stdout.trim() === EDITABLE_PROBE_ANSWER
	} catch {
		return false
	}
}

/** The project name of the nearest `pyproject.toml` naming one, from the folder up to the package root. */
function projectNameOf(params: { lotFolder: string; lotRoot: string }): string | undefined {
	const root = resolve(params.lotRoot)
	for (let folder = resolve(params.lotFolder); ; folder = dirname(folder)) {
		const path = join(folder, PYPROJECT_FILE)
		const name = existsSync(path)
			? readToml(readFileSync(path, 'utf8')).values.get(PROJECT_NAME_KEY)
			: undefined
		if (typeof name === 'string') return name
		if (folder === root || relative(root, folder).startsWith('..') || dirname(folder) === folder)
			return undefined
	}
}

/** The command is a file of a folder of the machine's PATH (with `.exe` on Windows). */
function isOnPath(command: string): boolean {
	const names = process.platform === 'win32' ? [command, `${command}.exe`] : [command]
	return (process.env.PATH ?? '')
		.split(delimiter)
		.filter(Boolean)
		.some((folder) => names.some((name) => existsSync(join(folder, name))))
}
