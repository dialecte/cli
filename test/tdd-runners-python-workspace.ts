/**
 * Scratch packages for the tests of the pytest runner: a package of pytest files over a small production module, a
 * git repository committing `committed`, then `written` in the working tree (the change a `tdd red` or `tdd green`
 * reads); and the interpreters the tests run them with. A test that needs pytest fails, never skips, when the
 * machine's `python3` has none.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { createScratchRepository, writeFiles } from './scratch-repository.ts'
import {
	FORWARDING_INTERPRETER_TEMPLATE,
	HANGING_OUTPUT_PAUSE,
	HANGING_PID_FILE,
	HANGING_POLL_INTERVAL,
	HANGING_START_TIMEOUT,
	LOGGING_INTERPRETER_TEMPLATE,
	PYTHON_PACKAGE_FILES,
	PYTHON_PROBE_TIMEOUT,
	VENV_PYTHON_PATH,
	XDIST_PYTHON_VARIABLE,
} from './tdd-runners-python-workspace.constants.ts'

import type { InterpreterScript, PythonPackageParts } from './tdd-runners-python-workspace.types.ts'

/** Throws, naming what is missing, unless the machine's `python3` imports pytest. */
export function requirePytest(): void {
	const probe = spawnSync('python3', ['-m', 'pytest', '--version'], {
		encoding: 'utf8',
		timeout: PYTHON_PROBE_TIMEOUT,
	})
	if (probe.status !== 0)
		throw new Error(
			`these tests run pytest through the machine's python3, which has none: install pytest for python3 (${probe.error?.message ?? probe.stderr.trim()})`,
		)
}

export function createPythonPackage(parts: PythonPackageParts): string {
	requirePytest()
	const root = createScratchRepository({ ...PYTHON_PACKAGE_FILES, ...parts.committed })
	writeFiles({ root, files: parts.written ?? {} })
	return root
}

/** Writes `<root>/<folder>/.venv/bin/python` as an executable script; answers its path. */
export function installInterpreter(params: InterpreterScript): string {
	const path = join(params.root, params.folder, VENV_PYTHON_PATH)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, params.script)
	chmodSync(path, 0o755)
	return path
}

/** An interpreter script that appends a line to `log` each time it runs, then runs the machine's `python3`. */
export function loggingInterpreter(params: { log: string }): string {
	return LOGGING_INTERPRETER_TEMPLATE.replace('{log}', () => params.log)
}

/** An interpreter script that runs `target` in its place. */
export function forwardingInterpreter(params: { target: string }): string {
	return FORWARDING_INTERPRETER_TEMPLATE.replace('{target}', () => params.target)
}

/**
 * A python that imports pytest-xdist: the one `DIALECTE_XDIST_PYTHON` names, else the machine's `python3` when it
 * imports xdist. Undefined when there is none (the xdist case then skips).
 */
export function findXdistPython(): string | undefined {
	const candidate = process.env[XDIST_PYTHON_VARIABLE] ?? 'python3'
	return importsXdist(candidate) ? candidate : undefined
}

function importsXdist(python: string): boolean {
	return spawnSync(python, ['-c', 'import xdist'], { timeout: PYTHON_PROBE_TIMEOUT }).status === 0
}

/** Waits (bounded) until the hanging interpreter printed its line and wrote its pid, then lets the output reach the run. */
export async function waitForHangingInterpreter(params: { root: string }): Promise<void> {
	const file = join(params.root, HANGING_PID_FILE)
	const deadline = Date.now() + HANGING_START_TIMEOUT
	while (!existsSync(file) && Date.now() < deadline)
		await new Promise((resolveWait) => setTimeout(resolveWait, HANGING_POLL_INTERVAL))
	await new Promise((resolveWait) => setTimeout(resolveWait, HANGING_OUTPUT_PAUSE))
}

/** Stops the hanging interpreter the package installed, when it started (its process id is next to it). */
export function stopHangingInterpreter(params: { root: string }): void {
	const file = join(params.root, HANGING_PID_FILE)
	if (!existsSync(file)) return
	try {
		process.kill(Number(readFileSync(file, 'utf8').trim()), 'SIGKILL')
	} catch {
		// it ended on its own
	}
}

/** The folders named one of `names` anywhere under `root` (a `.git` folder and a `.venv` one not entered), relative, sorted. */
export function foldersNamed(params: { root: string; names: readonly string[] }): string[] {
	return foldersNamedUnder({ ...params, folder: params.root }).sort()
}

function foldersNamedUnder(params: {
	root: string
	names: readonly string[]
	folder: string
}): string[] {
	return readdirSync(params.folder, { withFileTypes: true }).flatMap(function foldersOf(entry) {
		if (!entry.isDirectory() || entry.name === '.git' || entry.name === '.venv') return []
		const path = join(params.folder, entry.name)
		const found = params.names.includes(entry.name) ? [relativeTo({ root: params.root, path })] : []
		return [...found, ...foldersNamedUnder({ ...params, folder: path })]
	})
}

function relativeTo(params: { root: string; path: string }): string {
	return resolve(params.path).slice(resolve(params.root).length + 1)
}
