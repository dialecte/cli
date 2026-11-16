import { join } from 'node:path'

import {
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import {
	PYTEST_INI_TEXT,
	TOML_PLAIN_TEXT,
	TRIVIAL_TEST_TEXT,
	SETUP_CFG_PYTEST_TEXT,
	SETUP_CFG_PLAIN_TEXT,
	TOML_PYTEST_TEXT,
	TOX_INI_PLAIN_TEXT,
	TOX_INI_PYTEST_TEXT,
	VENV_PYTHON_PATH,
	VENV_WINDOWS_PYTHON_PATH,
} from '../../../test/tdd-runners-python-workspace.constants.ts'
import { resolvePython, resolvePytestFolder } from './package-python.ts'

import { describe, expect, it } from 'vitest'

/** A repository whose working tree holds `files` (the repository root is the package root). */
function packageWith(files: Record<string, string>): string {
	const root = initializeRepository({ root: temporaryFolder('dialecte-pp-') })
	writeFiles({ root, files })
	return root
}

/** A `PATH` lookup that finds exactly the commands named. */
function pathHolding(...commands: string[]): (command: string) => boolean {
	return function isOnPath(command: string): boolean {
		return commands.includes(command)
	}
}

describe('resolvePytestFolder', () => {
	it('a test file under python/tests, python/pyproject.toml holding [tool.pytest → the python folder', () => {
		const root = packageWith({
			'python/pyproject.toml': TOML_PYTEST_TEXT,
			'python/tests/test_a.py': TRIVIAL_TEST_TEXT,
		})

		expect(resolvePytestFolder({ root, file: 'python/tests/test_a.py' })).toBe(join(root, 'python'))
	})

	it('a pytest.ini next to the test file → that folder', () => {
		const root = packageWith({
			'checks/pytest.ini': PYTEST_INI_TEXT,
			'checks/test_a.py': TRIVIAL_TEST_TEXT,
		})

		expect(resolvePytestFolder({ root, file: 'checks/test_a.py' })).toBe(join(root, 'checks'))
	})

	it('a tox.ini holding [pytest] → its folder', () => {
		const root = packageWith({
			'checks/tox.ini': TOX_INI_PYTEST_TEXT,
			'checks/tests/test_a.py': TRIVIAL_TEST_TEXT,
		})

		expect(resolvePytestFolder({ root, file: 'checks/tests/test_a.py' })).toBe(join(root, 'checks'))
	})

	it('a setup.cfg holding [tool:pytest] → its folder', () => {
		const root = packageWith({
			'checks/setup.cfg': SETUP_CFG_PYTEST_TEXT,
			'checks/tests/test_a.py': TRIVIAL_TEST_TEXT,
		})

		expect(resolvePytestFolder({ root, file: 'checks/tests/test_a.py' })).toBe(join(root, 'checks'))
	})

	it('a pyproject.toml, a tox.ini and a setup.cfg that hold no pytest section → the package root', () => {
		const root = packageWith({
			'checks/pyproject.toml': TOML_PLAIN_TEXT,
			'checks/tox.ini': TOX_INI_PLAIN_TEXT,
			'checks/setup.cfg': SETUP_CFG_PLAIN_TEXT,
			'checks/tests/test_a.py': TRIVIAL_TEST_TEXT,
		})

		expect(resolvePytestFolder({ root, file: 'checks/tests/test_a.py' })).toBe(root)
	})

	it('two configurations on the way up → the nearest to the file', () => {
		const root = packageWith({
			'checks/pytest.ini': PYTEST_INI_TEXT,
			'checks/inner/pyproject.toml': TOML_PYTEST_TEXT,
			'checks/inner/tests/test_a.py': TRIVIAL_TEST_TEXT,
		})

		expect(resolvePytestFolder({ root, file: 'checks/inner/tests/test_a.py' })).toBe(
			join(root, 'checks', 'inner'),
		)
	})

	it('a configuration above the package root only → the package root', () => {
		const repository = packageWith({ 'pytest.ini': PYTEST_INI_TEXT })
		const root = join(repository, 'packages', 'demo')
		writeFiles({ root, files: { 'tests/test_a.py': TRIVIAL_TEST_TEXT } })

		expect(resolvePytestFolder({ root, file: 'tests/test_a.py' })).toBe(root)
	})

	it('no configuration at all → the package root', () => {
		const root = packageWith({ 'tests/test_a.py': TRIVIAL_TEST_TEXT })

		expect(resolvePytestFolder({ root, file: 'tests/test_a.py' })).toBe(root)
	})
})

describe('resolvePython', () => {
	it('a .venv in the pytest folder → its interpreter, no argument', () => {
		const root = packageWith({ [`python/${VENV_PYTHON_PATH}`]: '' })
		const folder = join(root, 'python')

		expect(resolvePython({ root, folder, hasCommand: pathHolding('uv') })).toEqual({
			command: join(folder, VENV_PYTHON_PATH),
			arguments: [],
		})
	})

	it('a .venv at the repository root, the pytest folder below it → the root interpreter', () => {
		const root = packageWith({ [VENV_PYTHON_PATH]: '', 'python/pytest.ini': PYTEST_INI_TEXT })

		expect(
			resolvePython({ root, folder: join(root, 'python'), hasCommand: pathHolding() }),
		).toEqual({ command: join(root, VENV_PYTHON_PATH), arguments: [] })
	})

	it('a .venv in the pytest folder and one at the repository root → the folder one', () => {
		const root = packageWith({ [VENV_PYTHON_PATH]: '', [`python/${VENV_PYTHON_PATH}`]: '' })
		const folder = join(root, 'python')

		expect(resolvePython({ root, folder, hasCommand: pathHolding() })).toEqual({
			command: join(folder, VENV_PYTHON_PATH),
			arguments: [],
		})
	})

	it('a .venv above the repository root → not taken, python3', () => {
		const outside = temporaryFolder('dialecte-pp-')
		writeFiles({ root: outside, files: { [VENV_PYTHON_PATH]: '' } })
		const root = initializeRepository({ root: join(outside, 'repository') })

		expect(resolvePython({ root, folder: root, hasCommand: pathHolding() })).toEqual({
			command: 'python3',
			arguments: [],
		})
	})

	it('no .venv, a uv.lock on the walk, uv on the PATH → uv run --frozen python', () => {
		const root = packageWith({ 'uv.lock': '', 'python/pytest.ini': PYTEST_INI_TEXT })

		expect(
			resolvePython({ root, folder: join(root, 'python'), hasCommand: pathHolding('uv') }),
		).toEqual({ command: 'uv', arguments: ['run', '--frozen', 'python'] })
	})

	it('no .venv, a uv.lock on the walk, uv not on the PATH → python3', () => {
		const root = packageWith({ 'uv.lock': '' })

		expect(resolvePython({ root, folder: root, hasCommand: pathHolding() })).toEqual({
			command: 'python3',
			arguments: [],
		})
	})

	it('no .venv, no uv.lock, uv on the PATH → python3', () => {
		const root = packageWith({})

		expect(resolvePython({ root, folder: root, hasCommand: pathHolding('uv') })).toEqual({
			command: 'python3',
			arguments: [],
		})
	})

	it('a package below the repository root, the .venv at the repository root → the root interpreter', () => {
		const repository = packageWith({ [VENV_PYTHON_PATH]: '' })
		const root = join(repository, 'packages', 'demo')
		writeFiles({ root, files: { 'pytest.ini': PYTEST_INI_TEXT } })

		expect(resolvePython({ root, folder: root, hasCommand: pathHolding() })).toEqual({
			command: join(repository, VENV_PYTHON_PATH),
			arguments: [],
		})
	})

	it('win32, a .venv with Scripts/python.exe in the pytest folder → that interpreter', () => {
		const root = packageWith({ [VENV_WINDOWS_PYTHON_PATH]: '' })

		expect(
			resolvePython({ root, folder: root, hasCommand: pathHolding(), platform: 'win32' }),
		).toEqual({ command: join(root, VENV_WINDOWS_PYTHON_PATH), arguments: [] })
	})

	it('win32, a .venv holding only bin/python → not taken, python', () => {
		const root = packageWith({ [VENV_PYTHON_PATH]: '' })

		expect(
			resolvePython({ root, folder: root, hasCommand: pathHolding(), platform: 'win32' }),
		).toEqual({ command: 'python', arguments: [] })
	})

	it('win32, no .venv → python', () => {
		const root = packageWith({})

		expect(
			resolvePython({ root, folder: root, hasCommand: pathHolding(), platform: 'win32' }),
		).toEqual({ command: 'python', arguments: [] })
	})

	it('a .venv and a uv.lock → the .venv interpreter', () => {
		const root = packageWith({ [VENV_PYTHON_PATH]: '', 'uv.lock': '' })

		expect(resolvePython({ root, folder: root, hasCommand: pathHolding('uv') })).toEqual({
			command: join(root, VENV_PYTHON_PATH),
			arguments: [],
		})
	})
})
