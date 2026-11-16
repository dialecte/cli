/**
 * The runner of each test file: a Python test file under pytest, a file importing `node:test` under node, a file a
 * vitest config holds under vitest, any other file under none; and the changed test files split by runner.
 */
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { DEFAULT_VITEST_EXCLUDE } from './tdd.constants.ts'
import { groupFilesByRunner, runnerOf } from './test-runner.ts'

import { describe, expect, it } from 'vitest'

import type { ChangedTestFile, RunnerGroups, TestRunner, VitestConfigs } from './tdd.types.ts'

/** No config file: vitest's own defaults hold every `*.test.*` and `*.spec.*` file. */
const NO_CONFIG: VitestConfigs = { configs: [], defaultConfig: undefined }

/** The default config includes `src/**\/*.test.ts` alone. */
const SRC_ONLY: VitestConfigs = configIncluding(['src/**/*.test.ts'])

/** The default config includes a list it cannot fully read. */
const UNREAD_INCLUDE: VitestConfigs = {
	configs: [
		{
			file: 'vitest.config.ts',
			include: ['unit/**/*.test.ts'],
			exclude: [...DEFAULT_VITEST_EXCLUDE],
			includeUnread: true,
			excludeUnread: false,
			projects: [],
			inlineProjects: [],
			projectsUnread: false,
		},
	],
	defaultConfig: 'vitest.config.ts',
}

const VITEST_TEXT =
	"import { expect, it } from 'vitest'\n\nit('adds', () => expect(1 + 1).toBe(2))\n"
const NODE_TEXT =
	"import assert from 'node:assert'\nimport { test } from 'node:test'\n\ntest('adds', () => assert.equal(1 + 1, 2))\n"
const NODE_ONLY_ASSERT_TEXT =
	"import assert from 'node:assert'\n\nit('adds', () => assert.equal(1 + 1, 2))\n"
const NODE_NAMED_IN_COMMENT_TEXT =
	"// run with node:test? no: vitest\nimport { it } from 'vitest'\n\nit('adds', () => undefined)\n"
const PYTHON_TEXT = 'def test_adds():\n    assert 1 + 1 == 2\n'

const RUNNER_CASES: {
	title: string
	file: string
	text: string
	configs: VitestConfigs
	runner: TestRunner | undefined
}[] = [
	{
		title: 'a test_*.py file → pytest',
		file: 'python/tests/test_add.py',
		text: PYTHON_TEXT,
		configs: NO_CONFIG,
		runner: 'pytest',
	},
	{
		title: 'a *_test.py file → pytest',
		file: 'python/add_test.py',
		text: PYTHON_TEXT,
		configs: NO_CONFIG,
		runner: 'pytest',
	},
	{
		title: 'a test_*.py file in a package a vitest config holds the rest of → still pytest',
		file: 'test_add.py',
		text: PYTHON_TEXT,
		configs: SRC_ONLY,
		runner: 'pytest',
	},
	{
		title: 'conftest.py is a helper, not a test file → no runner',
		file: 'python/tests/conftest.py',
		text: 'import pytest\n',
		configs: NO_CONFIG,
		runner: undefined,
	},
	{
		title: 'a python file of production → no runner',
		file: 'python/generate/build.py',
		text: 'def build():\n    return 1\n',
		configs: NO_CONFIG,
		runner: undefined,
	},
	{
		title: 'a .test.ts importing node:test and no vitest config holding it → node',
		file: 'tools/add.test.ts',
		text: NODE_TEXT,
		configs: SRC_ONLY,
		runner: 'node',
	},
	{
		title: 'a .test.ts importing node:test that a vitest config holds → node, the import wins',
		file: 'src/add.test.ts',
		text: NODE_TEXT,
		configs: SRC_ONLY,
		runner: 'node',
	},
	{
		title: 'a .test.mjs importing node:test → node',
		file: 'src/add.test.mjs',
		text: NODE_TEXT,
		configs: NO_CONFIG,
		runner: 'node',
	},
	{
		title: 'a .test.ts with a named import of node:test in a vitest-held folder → node',
		file: 'src/a.test.ts',
		text: "import { test } from 'node:test'\n\ntest('adds', () => undefined)\n",
		configs: SRC_ONLY,
		runner: 'node',
	},
	{
		title: 'a .test.ts with a default import of node:test in double quotes → node',
		file: 'src/a.test.ts',
		text: 'import test from "node:test"\n\ntest("adds", () => undefined)\n',
		configs: SRC_ONLY,
		runner: 'node',
	},
	{
		title: 'a .test.ts with a namespace import of node:test → node',
		file: 'src/a.test.ts',
		text: "import * as nodeTest from 'node:test'\n\nnodeTest.test('adds', () => undefined)\n",
		configs: SRC_ONLY,
		runner: 'node',
	},
	{
		title: 'a .test.ts with a side-effect import of node:test → node',
		file: 'src/a.test.ts',
		text: "import 'node:test'\n",
		configs: SRC_ONLY,
		runner: 'node',
	},
	{
		title: 'a .test.ts re-exporting from node:test → node',
		file: 'src/a.test.ts',
		text: "export { test } from 'node:test'\n",
		configs: SRC_ONLY,
		runner: 'node',
	},
	{
		title: 'a .test.ts importing node:test dynamically → node',
		file: 'src/a.test.ts',
		text: "const { test } = await import('node:test')\n\ntest('adds', () => undefined)\n",
		configs: SRC_ONLY,
		runner: 'node',
	},
	{
		title: 'a .test.cjs requiring node:test → node',
		file: 'src/a.test.cjs',
		text: "const { test } = require('node:test')\n\ntest('adds', () => undefined)\n",
		configs: SRC_ONLY,
		runner: 'node',
	},
	{
		title: 'a vitest-held .test.ts importing only a type from node:test → vitest',
		file: 'src/a.test.ts',
		text: "import type { TestContext } from 'node:test'\nimport { it } from 'vitest'\n\nit('adds', (context: TestContext) => undefined)\n",
		configs: SRC_ONLY,
		runner: 'vitest',
	},
	{
		title: 'a vitest-held .test.ts that only mocks node:test with vi.mock → vitest',
		file: 'src/a.test.ts',
		text: "import { it, vi } from 'vitest'\n\nvi.mock('node:test')\n\nit('adds', () => undefined)\n",
		configs: SRC_ONLY,
		runner: 'vitest',
	},
	{
		title: 'a .test.ts held by a vitest config that imports node:assert only → vitest',
		file: 'src/add.test.ts',
		text: NODE_ONLY_ASSERT_TEXT,
		configs: SRC_ONLY,
		runner: 'vitest',
	},
	{
		title: 'a .test.ts held by a vitest config that names node:test in a comment only → vitest',
		file: 'src/add.test.ts',
		text: NODE_NAMED_IN_COMMENT_TEXT,
		configs: SRC_ONLY,
		runner: 'vitest',
	},
	{
		title: 'a .test.ts the default config includes, importing vitest → vitest',
		file: 'src/add.test.ts',
		text: VITEST_TEXT,
		configs: SRC_ONLY,
		runner: 'vitest',
	},
	{
		title: 'a .spec.ts with no config file at all (vitest defaults hold it) → vitest',
		file: 'e2e/add.spec.ts',
		text: VITEST_TEXT,
		configs: NO_CONFIG,
		runner: 'vitest',
	},
	{
		title: 'a .test.ts a config with an unread include may hold → vitest (fails closed)',
		file: 'src/add.test.ts',
		text: VITEST_TEXT,
		configs: UNREAD_INCLUDE,
		runner: 'vitest',
	},
	{
		title: 'a .spec.ts no vitest config includes and no node:test import → no runner',
		file: 'e2e/add.spec.ts',
		text: VITEST_TEXT,
		configs: SRC_ONLY,
		runner: undefined,
	},
	{
		title: 'a .test.ts in a folder no vitest config includes and no node:test import → no runner',
		file: 'tools/add.test.ts',
		text: VITEST_TEXT,
		configs: SRC_ONLY,
		runner: undefined,
	},
]

describe('runnerOf', () => {
	for (const scenario of RUNNER_CASES)
		it(scenario.title, () => {
			const root = temporaryFolder('dialecte-package-')

			expect(
				runnerOf({
					root,
					file: scenario.file,
					text: scenario.text,
					configs: scenario.configs,
				}),
			).toBe(scenario.runner)
		})
})

const GROUP_CASES: {
	title: string
	files: ChangedTestFile[]
	configs: VitestConfigs
	expected: RunnerGroups
}[] = [
	{
		title:
			'a mixed list → one group per runner in the order vitest, node, pytest, each keeping the input order',
		files: [
			changed('python/tests/test_b.py', PYTHON_TEXT),
			changed('src/a.test.ts', VITEST_TEXT),
			changed('src/n.test.ts', NODE_TEXT),
			changed('python/tests/test_a.py', PYTHON_TEXT),
			changed('src/z.test.ts', VITEST_TEXT),
		],
		configs: SRC_ONLY,
		expected: {
			groups: [
				{ runner: 'vitest', files: ['src/a.test.ts', 'src/z.test.ts'] },
				{ runner: 'node', files: ['src/n.test.ts'] },
				{ runner: 'pytest', files: ['python/tests/test_b.py', 'python/tests/test_a.py'] },
			],
			outside: [],
		},
	},
	{
		title: 'vitest files only → one group, no empty group for the other runners',
		files: [changed('src/a.test.ts', VITEST_TEXT)],
		configs: SRC_ONLY,
		expected: { groups: [{ runner: 'vitest', files: ['src/a.test.ts'] }], outside: [] },
	},
	{
		title: 'python files only → one pytest group',
		files: [changed('test_a.py', PYTHON_TEXT), changed('b_test.py', PYTHON_TEXT)],
		configs: SRC_ONLY,
		expected: { groups: [{ runner: 'pytest', files: ['test_a.py', 'b_test.py'] }], outside: [] },
	},
	{
		title: 'a spec of no runner beside a vitest file → returned apart, in no group',
		files: [
			changed('e2e/b.spec.ts', VITEST_TEXT),
			changed('src/a.test.ts', VITEST_TEXT),
			changed('e2e/a.spec.ts', VITEST_TEXT),
		],
		configs: SRC_ONLY,
		expected: {
			groups: [{ runner: 'vitest', files: ['src/a.test.ts'] }],
			outside: ['e2e/b.spec.ts', 'e2e/a.spec.ts'],
		},
	},
	{
		title: 'only files of no runner → no group, every file apart',
		files: [changed('e2e/a.spec.ts', VITEST_TEXT)],
		configs: SRC_ONLY,
		expected: { groups: [], outside: ['e2e/a.spec.ts'] },
	},
	{
		title: 'no file → no group, nothing apart',
		files: [],
		configs: SRC_ONLY,
		expected: { groups: [], outside: [] },
	},
]

describe('groupFilesByRunner', () => {
	for (const scenario of GROUP_CASES)
		it(scenario.title, () => {
			const root = temporaryFolder('dialecte-package-')

			expect(
				groupFilesByRunner({ root, files: scenario.files, configs: scenario.configs }),
			).toEqual(scenario.expected)
		})
})

function changed(file: string, text: string): ChangedTestFile {
	return { file, text, baseText: undefined }
}

function configIncluding(include: string[]): VitestConfigs {
	return {
		configs: [
			{
				file: 'vitest.config.ts',
				include,
				exclude: [...DEFAULT_VITEST_EXCLUDE],
				includeUnread: false,
				excludeUnread: false,
				projects: [],
				inlineProjects: [],
				projectsUnread: false,
			},
		],
		defaultConfig: 'vitest.config.ts',
	}
}
