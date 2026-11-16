import { existsSync, readFileSync } from 'node:fs'
import { delimiter, dirname, join, relative, resolve } from 'node:path'

import { walkedFolders } from './package-vitest.ts'
import { readPytestConfig } from './pytest-config.ts'
import {
	DEFAULT_NORECURSEDIRS,
	DEFAULT_PYTHON_COMMAND,
	DEFAULT_PYTHON_FILES,
	DEFAULT_WINDOWS_PYTHON_COMMAND,
	PYTEST_CONFIG_FILES,
	UV_LOCK_FILE,
	UV_PYTHON_COMMAND,
	VENV_PYTHON_PATH,
	VENV_WINDOWS_PYTHON_PATH,
} from './tdd.constants.ts'

import type { PackagePython, PytestConfig, PytestFolder } from './tdd.types.ts'

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

/** The command is a file of a folder of the machine's PATH (with `.exe` on Windows). */
function isOnPath(command: string): boolean {
	const names = process.platform === 'win32' ? [command, `${command}.exe`] : [command]
	return (process.env.PATH ?? '')
		.split(delimiter)
		.filter(Boolean)
		.some((folder) => names.some((name) => existsSync(join(folder, name))))
}
