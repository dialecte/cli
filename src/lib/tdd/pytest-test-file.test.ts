/**
 * Whether pytest collects a file of the package as a test module, decided as its discovery decides it from the
 * file's pytest folder and that folder's configuration: `python_files` on the name (or the path), under one of
 * `testpaths` when it names any that exist, in no folder `norecursedirs` (or a virtual environment, or
 * `__pycache__`) names below where discovery starts. Each row was checked against pytest 8.4 and 9.0.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { isPytestTestFile } from './pytest-test-file.ts'

import { describe, expect, it } from 'vitest'

const CASE_TEXT = 'def test_one():\n    assert True\n'

const CASES: {
	title: string
	/** The configuration files of the package, by path. */
	config: Record<string, string>
	/** Folders made empty beside the file (a virtual environment's marker is a file in one). */
	folders?: string[]
	file: string
	expected: boolean
}[] = [
	{
		title: 'no configuration, tests/test_a.py → collected',
		config: {},
		file: 'tests/test_a.py',
		expected: true,
	},
	{
		title: 'no configuration, a *_test.py at the root → collected',
		config: {},
		file: 'add_test.py',
		expected: true,
	},
	{
		title: 'no configuration, tests/helpers.py → not collected: python_files',
		config: {},
		file: 'tests/helpers.py',
		expected: false,
	},
	{
		title:
			'no configuration, tests/fixtures/test_x.py → collected: fixtures is in no default norecursedirs',
		config: {},
		file: 'tests/fixtures/test_x.py',
		expected: true,
	},
	{
		title: 'norecursedirs = fixtures, tests/fixtures/test_x.py → not collected',
		config: { 'pytest.ini': '[pytest]\nnorecursedirs = fixtures\n' },
		file: 'tests/fixtures/test_x.py',
		expected: false,
	},
	{
		title: 'norecursedirs = fixtures replaces the defaults: build/test_a.py → collected',
		config: { 'pytest.ini': '[pytest]\nnorecursedirs = fixtures\n' },
		file: 'build/test_a.py',
		expected: true,
	},
	{
		title: 'the default norecursedirs, build/test_a.py → not collected',
		config: {},
		file: 'build/test_a.py',
		expected: false,
	},
	{
		title: 'the default norecursedirs, a hidden folder → not collected',
		config: {},
		file: '.hidden/test_a.py',
		expected: false,
	},
	{
		title: 'the default norecursedirs, a folder ending in .egg → not collected',
		config: {},
		file: 'pkg.egg/test_a.py',
		expected: false,
	},
	{
		title: 'the default norecursedirs, under node_modules → not collected',
		config: {},
		file: 'node_modules/tool/test_a.py',
		expected: false,
	},
	{
		title: 'a folder holding pyvenv.cfg (a virtual environment) → not collected',
		config: { 'env/pyvenv.cfg': 'home = /usr/bin\n' },
		file: 'env/test_a.py',
		expected: false,
	},
	{
		title: 'a file in __pycache__ → not collected',
		config: {},
		file: 'tests/__pycache__/test_a.py',
		expected: false,
	},
	{
		title: 'testpaths = ["tests"], scripts/test_tool.py → not collected: outside the testpaths',
		config: { 'pyproject.toml': '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n' },
		folders: ['tests'],
		file: 'scripts/test_tool.py',
		expected: false,
	},
	{
		title: 'testpaths = ["tests"], tests/unit/test_a.py → collected',
		config: { 'pyproject.toml': '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n' },
		file: 'tests/unit/test_a.py',
		expected: true,
	},
	{
		title:
			'testpaths naming no folder that exists → discovery from the folder: scripts/test_tool.py collected',
		config: { 'pytest.ini': '[pytest]\ntestpaths = nowhere\n' },
		file: 'scripts/test_tool.py',
		expected: true,
	},
	{
		title:
			'testpaths = build, build/test_a.py → collected: a testpath itself is never filtered by norecursedirs',
		config: { 'pytest.ini': '[pytest]\ntestpaths = build\n' },
		file: 'build/test_a.py',
		expected: true,
	},
	{
		title: 'testpaths = build, build/build/test_a.py → not collected: a build folder below it is',
		config: { 'pytest.ini': '[pytest]\ntestpaths = build\n' },
		file: 'build/build/test_a.py',
		expected: false,
	},
	{
		title: 'testpaths = tests/*/unit, tests/a/unit/test_a.py → collected',
		config: { 'pytest.ini': '[pytest]\ntestpaths = tests/*/unit\n' },
		folders: ['tests/a/other'],
		file: 'tests/a/unit/test_a.py',
		expected: true,
	},
	{
		title: 'testpaths = tests/*/unit, tests/a/other/test_b.py → not collected',
		config: { 'pytest.ini': '[pytest]\ntestpaths = tests/*/unit\n' },
		folders: ['tests/a/unit'],
		file: 'tests/a/other/test_b.py',
		expected: false,
	},
	{
		title: 'testpaths naming the file itself, a name python_files does not match → collected',
		config: { 'pytest.ini': '[pytest]\ntestpaths = tests/smoke.py\n' },
		file: 'tests/smoke.py',
		expected: true,
	},
	{
		title: 'python_files = check_*.py, tests/check_a.py → collected',
		config: { 'pytest.ini': '[pytest]\npython_files = check_*.py\n' },
		file: 'tests/check_a.py',
		expected: true,
	},
	{
		title: 'python_files = check_*.py, tests/test_a.py → not collected',
		config: { 'pytest.ini': '[pytest]\npython_files = check_*.py\n' },
		file: 'tests/test_a.py',
		expected: false,
	},
	{
		title:
			'python_files holding a / matches the path: tests/*/test_*.py, tests/sub/test_a.py → collected',
		config: { 'pytest.ini': '[pytest]\npython_files = tests/*/test_*.py\n' },
		file: 'tests/sub/test_a.py',
		expected: true,
	},
	{
		title:
			'python_files holding a / matches the path: tests/*/test_*.py, tests/test_top.py → not collected',
		config: { 'pytest.ini': '[pytest]\npython_files = tests/*/test_*.py\n' },
		file: 'tests/test_top.py',
		expected: false,
	},
	{
		title: 'python_files = *, a file that is no Python file → not collected',
		config: { 'pytest.ini': '[pytest]\npython_files = *\n' },
		file: 'tests/test_a.txt',
		expected: false,
	},
	{
		title:
			'a nested pytest folder with python_files = check_*.py, its test_a.py → not collected (its own configuration)',
		config: { 'checks/pytest.ini': '[pytest]\npython_files = check_*.py\n' },
		file: 'checks/tests/test_a.py',
		expected: false,
	},
	{
		title:
			'a nested pytest folder with testpaths = tests, a file beside the testpath → not collected',
		config: { 'checks/tox.ini': '[pytest]\ntestpaths = tests\n' },
		folders: ['checks/tests'],
		file: 'checks/tools/test_a.py',
		expected: false,
	},
]

describe('isPytestTestFile', () => {
	for (const scenario of CASES)
		it(scenario.title, () => {
			const root = temporaryFolder('dialecte-pytest-package-')
			writeFiles({ root, files: { ...scenario.config, [scenario.file]: CASE_TEXT } })
			for (const folder of scenario.folders ?? [])
				mkdirSync(join(root, folder), { recursive: true })

			expect(isPytestTestFile({ root, file: scenario.file })).toBe(scenario.expected)
		})
})
