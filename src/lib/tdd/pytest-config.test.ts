/**
 * The discovery settings of a pytest configuration file, read from its text as pytest reads it: `python_files`,
 * `testpaths` and `norecursedirs` (pytest's defaults for what the file does not declare), or none when the file
 * configures no pytest.
 */
import { readPytestConfig } from './pytest-config.ts'

import { describe, expect, it } from 'vitest'

import type { PytestConfig } from './tdd.types.ts'

const DEFAULT_PYTHON_FILES = ['test_*.py', '*_test.py']
const DEFAULT_NORECURSEDIRS = [
	'*.egg',
	'.*',
	'_darcs',
	'build',
	'CVS',
	'dist',
	'node_modules',
	'venv',
	'{arch}',
]
const DEFAULTS: PytestConfig = {
	pythonFiles: DEFAULT_PYTHON_FILES,
	testpaths: [],
	norecursedirs: DEFAULT_NORECURSEDIRS,
}

const CASES: { title: string; name: string; text: string; expected: PytestConfig | undefined }[] = [
	{
		title:
			'a pyproject.toml with [tool.pytest.ini_options] testpaths = ["tests"] → testpaths, the other two by default',
		name: 'pyproject.toml',
		text: '[project]\nname = "demo"\n\n[tool.pytest.ini_options]\npythonpath = ["."]\ntestpaths = ["tests"]\n',
		expected: { ...DEFAULTS, testpaths: ['tests'] },
	},
	{
		title: 'a pyproject.toml with no pytest table → no configuration',
		name: 'pyproject.toml',
		text: '[project]\nname = "demo"\n# [tool.pytest.ini_options] in a comment only\n',
		expected: undefined,
	},
	{
		title:
			'a pyproject.toml with an empty [tool.pytest.ini_options] → a configuration of the defaults',
		name: 'pyproject.toml',
		text: '[tool.pytest.ini_options]\n',
		expected: DEFAULTS,
	},
	{
		title: 'a pyproject.toml with the native [tool.pytest] table → its arrays',
		name: 'pyproject.toml',
		text: '[tool.pytest]\npython_files = ["check_*.py"]\nnorecursedirs = ["fixtures"]\n',
		expected: { ...DEFAULTS, pythonFiles: ['check_*.py'], norecursedirs: ['fixtures'] },
	},
	{
		title: 'a pyproject.toml with dotted keys under [tool] → read as the same table',
		name: 'pyproject.toml',
		text: '[tool]\npytest.ini_options.testpaths = ["checks"]\n',
		expected: { ...DEFAULTS, testpaths: ['checks'] },
	},
	{
		title: 'an ini_options value written as a string → split as a shell line',
		name: 'pyproject.toml',
		text: '[tool.pytest.ini_options]\npython_files = "check_*.py  *_check.py"\n',
		expected: { ...DEFAULTS, pythonFiles: ['check_*.py', '*_check.py'] },
	},
	{
		title:
			'a multi-line array with comments and a trailing comma, literal and basic strings → every string',
		name: 'pyproject.toml',
		text: [
			'[tool.pytest.ini_options]',
			'testpaths = [',
			'    "tests",  # the unit tests',
			"    'integration',",
			']',
			'addopts = "-q"',
			'',
		].join('\n'),
		expected: { ...DEFAULTS, testpaths: ['tests', 'integration'] },
	},
	{
		title: 'the settings of another table after the pytest one → not read',
		name: 'pyproject.toml',
		text: '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n\n[tool.other]\nnorecursedirs = ["x"]\n',
		expected: { ...DEFAULTS, testpaths: ['tests'] },
	},
	{
		title: 'a pytest.toml with a [pytest] table → its values',
		name: 'pytest.toml',
		text: '[pytest]\ntestpaths = ["tests"]\n',
		expected: { ...DEFAULTS, testpaths: ['tests'] },
	},
	{
		title: 'a pytest.ini with no [pytest] section → still the configuration, of the defaults',
		name: 'pytest.ini',
		text: '[other]\ntestpaths = tests\n',
		expected: DEFAULTS,
	},
	{
		title: 'a pytest.ini norecursedirs of two words → both, the default list replaced',
		name: 'pytest.ini',
		text: '[pytest]\nnorecursedirs = fixtures build\n',
		expected: { ...DEFAULTS, norecursedirs: ['fixtures', 'build'] },
	},
	{
		title: 'a value continued on indented lines, a comment line between them → every word',
		name: 'pytest.ini',
		text: '[pytest]\ntestpaths =\n    tests\n    # the slow ones\n    integration\n',
		expected: { ...DEFAULTS, testpaths: ['tests', 'integration'] },
	},
	{
		title: 'a # after a value → kept in the value, as pytest keeps it',
		name: 'pytest.ini',
		text: '[pytest]\ntestpaths = tests # main\n',
		expected: { ...DEFAULTS, testpaths: ['tests', '#', 'main'] },
	},
	{
		title: 'a key written with a colon and quoted words → split as a shell line',
		name: 'pytest.ini',
		text: '[pytest]\npython_files: "test *.py" \'check_*.py\'\n',
		expected: { ...DEFAULTS, pythonFiles: ['test *.py', 'check_*.py'] },
	},
	{
		title: 'a tox.ini with a [pytest] section → its values',
		name: 'tox.ini',
		text: '[tox]\nenvlist = py\n\n[pytest]\ntestpaths = tests\n',
		expected: { ...DEFAULTS, testpaths: ['tests'] },
	},
	{
		title: 'a tox.ini with no [pytest] section → no configuration',
		name: 'tox.ini',
		text: '[tox]\nenvlist = py\n',
		expected: undefined,
	},
	{
		title: 'a setup.cfg with a [tool:pytest] section → its values',
		name: 'setup.cfg',
		text: '[metadata]\nname = demo\n\n[tool:pytest]\ntestpaths = tests\n',
		expected: { ...DEFAULTS, testpaths: ['tests'] },
	},
	{
		title:
			'a setup.cfg with a [pytest] section only → no configuration (pytest refuses that section there)',
		name: 'setup.cfg',
		text: '[pytest]\ntestpaths = tests\n',
		expected: undefined,
	},
	{
		title: 'a file pytest never reads its configuration from → no configuration',
		name: 'package.json',
		text: '{}\n',
		expected: undefined,
	},
]

describe('readPytestConfig', () => {
	for (const scenario of CASES)
		it(scenario.title, () => {
			expect(readPytestConfig({ name: scenario.name, text: scenario.text })).toEqual(
				scenario.expected,
			)
		})
})
