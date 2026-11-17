import { rmSync } from 'node:fs'
import { join } from 'node:path'

import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import {
	appendEntries,
	isPackageTestCode,
	isProductionPath,
	isTestCode,
	isTestFile,
	listChangedTestFiles,
	listDeletedTestFiles,
	readLedger,
} from './tdd-files.ts'
import { changedTestCodeOf } from './test-code-presence.ts'

import { describe, expect, it } from 'vitest'

import type { TddReceipt } from './tdd.types.ts'

describe('isTestCode', () => {
	it.each([
		['src/add.test.ts', true],
		['src/add.spec.mts', true],
		['test/expected.ts', true],
		['src/test/run-test-cases.ts', true],
		['src/__snapshots__/add.test.ts.snap', true],
		['src/view.snap', true],
		['src/fixtures/small.xml', true],
		['test/fixtures/small.xml', true],
		['src/__fixtures__/a.json', true],
		['src/add.ts', false],
		['src/testing-library.ts', false],
		['README.md', false],
	])('%s → %s', (file, expected) => {
		expect(isTestCode(file)).toBe(expected)
	})
})

const PACKAGE_JSON = { name: 'demo' }

const TEST_FILE_CASES: { title: string; file: string; expected: boolean }[] = [
	{ title: 'a .test.ts file → a test file', file: 'src/add.test.ts', expected: true },
	{ title: 'a .spec.mts file → a test file', file: 'src/add.spec.mts', expected: true },
	{
		title: 'a test_*.py file in a tests folder → a test file',
		file: 'python/tests/test_add.py',
		expected: true,
	},
	{ title: 'a test_*.py file at the root → a test file', file: 'test_add.py', expected: true },
	{ title: 'a *_test.py file → a test file', file: 'python/add_test.py', expected: true },
	{
		title: 'a helper of a python tests folder → not a test file',
		file: 'python/tests/helpers.py',
		expected: false,
	},
	{
		title: 'conftest.py → not a test file',
		file: 'python/tests/conftest.py',
		expected: false,
	},
	{
		title: 'test.py without an underscore → not a test file',
		file: 'python/test.py',
		expected: false,
	},
	{
		title: 'contest.py, a name ending in test → not a test file',
		file: 'python/contest.py',
		expected: false,
	},
	{
		title: 'a python production file → not a test file',
		file: 'python/generate/build.py',
		expected: false,
	},
	{ title: 'a .ts production file → not a test file', file: 'src/add.ts', expected: false },
]

describe('isTestFile', () => {
	for (const scenario of TEST_FILE_CASES)
		it(scenario.title, () => {
			const root = temporaryFolder('dialecte-package-')

			expect(isTestFile({ root, file: scenario.file })).toBe(scenario.expected)
		})
})

const PYTHON_TEST_CODE_CASES: { title: string; file: string; expected: boolean }[] = [
	{ title: 'conftest.py at the root → test code', file: 'conftest.py', expected: true },
	{
		title: 'conftest.py beside production python → test code',
		file: 'python/generate/conftest.py',
		expected: true,
	},
	{
		title: 'a test_*.py file outside a tests folder → test code',
		file: 'python/test_add.py',
		expected: true,
	},
	{
		title: 'a *_test.py file outside a tests folder → test code',
		file: 'python/add_test.py',
		expected: true,
	},
	{
		title: 'a helper in python/tests → test code',
		file: 'python/tests/helpers.py',
		expected: true,
	},
	{
		title: 'a fixture in python/tests/fixtures → test code',
		file: 'python/tests/fixtures/x.xsd',
		expected: true,
	},
	{
		title: 'a python file that only has conftest in its name → not test code',
		file: 'python/generate/conftest_builder.py',
		expected: false,
	},
	{
		title: 'a python production file → not test code',
		file: 'python/generate/build.py',
		expected: false,
	},
]

describe('isPackageTestCode on python files', () => {
	for (const scenario of PYTHON_TEST_CODE_CASES)
		it(scenario.title, () => {
			const root = temporaryFolder('dialecte-package-')

			expect(isPackageTestCode({ root, file: scenario.file, packageJson: PACKAGE_JSON })).toBe(
				scenario.expected,
			)
		})
})

const PYTHON_PRODUCTION_CASES: { title: string; file: string; expected: boolean }[] = [
	{ title: 'conftest.py at the root → not production', file: 'conftest.py', expected: false },
	{
		title: 'conftest.py beside production python → not production',
		file: 'python/generate/conftest.py',
		expected: false,
	},
	{
		title: 'a test_*.py file outside a tests folder → not production',
		file: 'python/test_add.py',
		expected: false,
	},
	{
		title: 'a helper in python/tests → not production',
		file: 'python/tests/helpers.py',
		expected: false,
	},
	{
		title: 'a fixture in python/tests/fixtures → not production',
		file: 'python/tests/fixtures/x.xsd',
		expected: false,
	},
	{
		title: 'a python file that only has conftest in its name → production',
		file: 'python/generate/conftest_builder.py',
		expected: true,
	},
	{
		title: 'a *_test.py file outside a tests folder → not production',
		file: 'python/add_test.py',
		expected: false,
	},
	{
		title: 'a python file of the generator → production',
		file: 'python/generate/build.py',
		expected: true,
	},
]

describe('isProductionPath on python files', () => {
	for (const scenario of PYTHON_PRODUCTION_CASES)
		it(scenario.title, () => {
			const root = temporaryFolder('dialecte-package-')

			expect(isProductionPath({ root, file: scenario.file, packageJson: PACKAGE_JSON })).toBe(
				scenario.expected,
			)
		})
})

describe('listChangedTestFiles', () => {
	it(
		'a new test_*.py, a new .test.ts, a conftest.py and a python helper → the two test files only, in name order',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const root = createScratchRepository()
			writeFiles({
				root,
				files: {
					'python/tests/test_add.py': 'def test_add():\n    assert 1 + 1 == 2\n',
					'src/add.test.ts': "import { it } from 'vitest'\n",
					'python/tests/conftest.py': 'import pytest\n',
					'python/tests/helpers.py': 'VALUE = 1\n',
				},
			})

			expect(
				listChangedTestFiles({
					root,
					base: 'HEAD',
					presence: changedTestCodeOf({ root, base: 'HEAD' }),
				}).map((changed) => changed.file),
			).toEqual(['python/tests/test_add.py', 'src/add.test.ts'])
		},
	)
})

describe('listDeletedTestFiles', () => {
	it(
		'a committed test_*.py and a committed helper deleted → the test_*.py only',
		{ timeout: STORE_CASE_TIMEOUT },
		() => {
			const root = createScratchRepository({
				'python/tests/test_add.py': 'def test_add():\n    assert 1 + 1 == 2\n',
				'python/tests/helpers.py': 'VALUE = 1\n',
			})
			rmSync(join(root, 'python/tests/test_add.py'))
			rmSync(join(root, 'python/tests/helpers.py'))

			expect(
				listDeletedTestFiles({
					root,
					base: 'HEAD',
					presence: changedTestCodeOf({ root, base: 'HEAD' }),
				}),
			).toEqual(['python/tests/test_add.py'])
		},
	)
})

describe('appendEntries', () => {
	it('the same production tree recorded at two bases (a default run, then a --base run) → each state kept under its own base', () => {
		const root = createScratchRepository()
		const receipt: TddReceipt = {
			kind: 'red',
			file: 'src/add.test.ts',
			name: 'add > one plus two',
			project: '',
			testFileHash: 'test',
			caseHash: 'case',
			productionHash: 'tree',
			at: '2026-11-01T12:00:00.000Z',
		}

		appendEntries({
			root,
			entries: [receipt],
			production: { hash: 'tree', base: 'head', files: {} },
		})
		appendEntries({
			root,
			entries: [receipt],
			production: { hash: 'tree', base: 'branch-start', files: { 'src/add.ts': 'add-1' } },
		})

		const ledger = readLedger(root)
		expect('failure' in ledger ? ledger : ledger.production).toEqual({
			head: { tree: {} },
			'branch-start': { tree: { 'src/add.ts': 'add-1' } },
		})
	})
})
