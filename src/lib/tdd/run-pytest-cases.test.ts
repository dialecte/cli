import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createFakeClock } from '../../../test/fake-clock.ts'
import { createFakeTree } from '../../../test/fake-process-tree.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import {
	ADD_MISSING_EXPORT_PYTEST_TEXT,
	ADD_ONE_PYTEST_TEXT,
	ADD_OUTSIDE_PYTEST_TEXT,
	ADD_PYTEST_FILE,
	ADD_RAISES_TEST_TEXT,
	ADDER_FILE,
	ADDER_IMPLEMENTED_TEXT,
	ADDER_STUB_TEXT,
	CONFTEST_FILE,
	CONFTEST_TEXT,
	FIXTURE_FILE,
	FIXTURE_TEXT,
	FOLDER_A_TEST_FILE,
	FOLDER_A_TEST_TEXT,
	FOLDER_A_TOML_TEXT,
	FOLDER_B_INI_TEXT,
	FOLDER_B_TEST_FILE,
	FOLDER_B_TEST_TEXT,
	GLOB_IGNORED_TEST_FILE,
	HANGING_INTERPRETER_TEXT,
	HELPERS_FILE,
	HELPERS_TEXT,
	HOOK_IGNORED_TEST_FILE,
	IDS_TEST_FILE,
	IDS_TEST_TEXT,
	IGNORED_TEST_FILE,
	IGNORING_CONFTEST_TEXT,
	INDENTATION_ERROR_TEST_TEXT,
	NO_TEST_FILE,
	NO_TEST_TEXT,
	PYTHON_CACHE_FOLDER_NAMES,
	PYTHON_RUN_CASE_TIMEOUT,
	READS_TEST_FILE,
	READS_TEST_TEXT,
	ROWS_PARAMETRIZED_TEST_TEXT,
	ROWS_TEST_FILE,
	SETUP_ERROR_TEST_TEXT,
	SKIPS_ONLY_PYTEST_FILE,
	SKIPS_ONLY_PYTEST_TEXT,
	STATES_TEST_FILE,
	STATES_TEST_TEXT,
	SYNTAX_ERROR_TEST_TEXT,
	TOML_PYTEST_TEXT,
	TRIVIAL_TEST_TEXT,
	WITHOUT_PYTEST_INTERPRETER_TEXT,
	XDIST_SKIP_REASON,
	XDIST_TOML_TEXT,
} from '../../../test/tdd-runners-python-workspace.constants.ts'
import {
	createPythonPackage,
	findXdistPython,
	forwardingInterpreter,
	foldersNamed,
	installInterpreter,
	loggingInterpreter,
	stopHangingInterpreter,
	waitForHangingInterpreter,
} from '../../../test/tdd-runners-python-workspace.ts'
import { runPytestCases } from './run-pytest-cases.ts'

import { describe, expect, it } from 'vitest'

import type { ReportedModule, TestRunFailure } from './tdd.types.ts'

/** The folder holding the cli's pytest plugin: a run must leave no bytecode there either. */
const PLUGIN_FOLDER = dirname(fileURLToPath(import.meta.url))

/** The cases of a run that a skip or a true skipif marks, by name (empty for a failed run). */
function skipMarkedNames(result: ReportedModule[] | TestRunFailure): string[] {
	if ('failure' in result) return []
	return result.flatMap((module) =>
		module.cases.filter((testCase) => testCase.skipMarked).map((testCase) => testCase.name),
	)
}

/** Each case of a collect: its name, its state, and whether a skip mark was read on it. */
function collectedOf(
	result: ReportedModule[] | TestRunFailure,
): { name: string; state: string; marked: boolean }[] {
	if ('failure' in result) return []
	return result.flatMap((module) =>
		module.cases.map((testCase) => ({
			name: testCase.name,
			state: testCase.state,
			marked: Boolean(testCase.skipMarked),
		})),
	)
}

/** A package whose production module is `adder` as given, holding `written`. */
function packageWith(params: { adder: string; written: Record<string, string> }): string {
	return createPythonPackage({
		committed: { [ADDER_FILE]: params.adder },
		written: params.written,
	})
}

describe('runPytestCases reports what pytest saw', { timeout: PYTHON_RUN_CASE_TIMEOUT }, () => {
	it('a passing case, a failing assert, a skip and an expected failure → each case named by its function, with its state, its def line and the AssertionError of the failing one', async () => {
		const root = packageWith({
			adder: ADDER_IMPLEMENTED_TEXT,
			written: { [STATES_TEST_FILE]: STATES_TEST_TEXT },
		})

		await expect(
			runPytestCases({ root, files: [STATES_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				file: expect.stringMatching(/tests\/test_states\.py$/),
				runner: 'pytest',
				errors: [],
				cases: [
					{ name: 'test_passes', state: 'passed', project: '', location: { line: 6 }, errors: [] },
					{
						name: 'test_fails',
						state: 'failed',
						location: { line: 10 },
						errors: [{ name: 'AssertionError', message: expect.stringContaining('== 3') }],
					},
					{ name: 'test_skipped', state: 'skipped', location: { line: 15 } },
					{ name: 'test_expected_failure', state: 'skipped', location: { line: 20 } },
				],
			},
		])
	})

	it('a parametrized method of a class, a tuple table and two stacked decorators → each case named with its id, with its def line, the function text without its decorators and the text of its row', async () => {
		const root = createPythonPackage({ written: { [ROWS_TEST_FILE]: ROWS_PARAMETRIZED_TEST_TEXT } })

		await expect(
			runPytestCases({ root, files: [ROWS_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				cases: [
					{
						name: 'TestRows > test_row[1]',
						location: { line: 6 },
						source: {
							call: expect.stringMatching(/^def test_row\(self, value\):\n {8}assert value > 0$/),
							row: '1',
						},
					},
					{
						name: 'TestRows > test_row[2]',
						location: { line: 6 },
						source: {
							call: expect.stringMatching(/^def test_row\(self, value\):\n {8}assert value > 0$/),
							row: '2',
						},
					},
					{
						name: 'test_pairs[1-2]',
						location: { line: 11 },
						source: {
							call: expect.stringMatching(
								/^def test_pairs\(left, right\):\n {4}assert left < right$/,
							),
							row: '(1, 2)',
						},
					},
					{ name: 'test_pairs[3-4]', source: { row: '(3, 4)' } },
					{
						name: 'test_stacked[7-3]',
						location: { line: 17 },
						source: {
							call: expect.stringMatching(
								/^def test_stacked\(first, second\):\n {4}assert first < second$/,
							),
							row: expect.stringMatching(/^(3\D+7|7\D+3)$/),
						},
					},
				],
			},
		])
	})

	it('the filter naming TestRows > test_row[2] → only that node id ran', async () => {
		const root = createPythonPackage({ written: { [ROWS_TEST_FILE]: ROWS_PARAMETRIZED_TEST_TEXT } })

		await expect(
			runPytestCases({
				root,
				files: [ROWS_TEST_FILE],
				filter: { names: ['TestRows > test_row[2]'] },
			}),
		).resolves.toMatchObject([{ cases: [{ name: 'TestRows > test_row[2]', state: 'passed' }] }])
	})

	it('the filter asking to collect, a file of a skip and a skipif(True) → both cases marked as skipped', async () => {
		const root = createPythonPackage({
			written: { [SKIPS_ONLY_PYTEST_FILE]: SKIPS_ONLY_PYTEST_TEXT },
		})

		await expect(
			runPytestCases({ root, files: [SKIPS_ONLY_PYTEST_FILE], filter: 'collect' }).then(
				skipMarkedNames,
			),
		).resolves.toEqual(['test_skipped', 'test_skipped_by_condition'])
	})

	it('the filter asking to collect, a passing, a failing, a skipped and an expected-failure case → nothing ran, every case reported skipped, only the skip mark read', async () => {
		const root = packageWith({
			adder: ADDER_IMPLEMENTED_TEXT,
			written: { [STATES_TEST_FILE]: STATES_TEST_TEXT },
		})

		await expect(
			runPytestCases({ root, files: [STATES_TEST_FILE], filter: 'collect' }).then(collectedOf),
		).resolves.toEqual([
			{ name: 'test_passes', state: 'skipped', marked: false },
			{ name: 'test_fails', state: 'skipped', marked: false },
			{ name: 'test_skipped', state: 'skipped', marked: true },
			{ name: 'test_expected_failure', state: 'skipped', marked: false },
		])
	})

	it('a file with no test function, pytest exiting 5 → not a failure', async () => {
		const root = createPythonPackage({ written: { [NO_TEST_FILE]: NO_TEST_TEXT } })

		await expect(
			runPytestCases({ root, files: [NO_TEST_FILE], filter: 'all' }),
		).resolves.not.toHaveProperty('failure')
	})

	it("files a conftest leaves out by collect_ignore, collect_ignore_glob and pytest_ignore_collect, named on the command line (pytest 8.4 and 9.0 still collect a named file) → no module for them, only the other file's", async () => {
		const root = packageWith({
			adder: ADDER_IMPLEMENTED_TEXT,
			written: {
				[CONFTEST_FILE]: IGNORING_CONFTEST_TEXT,
				[IGNORED_TEST_FILE]: TRIVIAL_TEST_TEXT,
				[GLOB_IGNORED_TEST_FILE]: TRIVIAL_TEST_TEXT,
				[HOOK_IGNORED_TEST_FILE]: TRIVIAL_TEST_TEXT,
				[ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT,
			},
		})

		const result = await runPytestCases({
			root,
			files: [IGNORED_TEST_FILE, GLOB_IGNORED_TEST_FILE, HOOK_IGNORED_TEST_FILE, ADD_PYTEST_FILE],
			filter: 'all',
		})

		expect('failure' in result ? result : result.map((module) => module.file)).toEqual([
			expect.stringMatching(/tests\/test_add\.py$/),
		])
	})
})

describe('runPytestCases reports the errors', { timeout: PYTHON_RUN_CASE_TIMEOUT }, () => {
	it('the stub raising NotImplementedError inside an assert → the error is in an assertion, its frames run from the stub to the test function', async () => {
		const root = packageWith({
			adder: ADDER_STUB_TEXT,
			written: { [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT },
		})

		await expect(
			runPytestCases({ root, files: [ADD_PYTEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				cases: [
					{
						name: 'test_one',
						state: 'failed',
						errors: [
							{
								name: 'NotImplementedError',
								inAssertion: true,
								frames: [
									{ file: expect.stringMatching(/\/adder\.py$/), line: 2 },
									{ file: expect.stringMatching(/\/tests\/test_add\.py$/), line: 5 },
								],
							},
						],
					},
				],
			},
		])
	})

	it('the stub raising before the assert → the error is not in an assertion', async () => {
		const root = packageWith({
			adder: ADDER_STUB_TEXT,
			written: { [ADD_PYTEST_FILE]: ADD_OUTSIDE_PYTEST_TEXT },
		})

		await expect(
			runPytestCases({ root, files: [ADD_PYTEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{ cases: [{ errors: [{ name: 'NotImplementedError', inAssertion: false }] }] },
		])
	})

	it('pytest.raises around a call that does not raise → the case failed with Failed: DID NOT RAISE', async () => {
		const root = packageWith({
			adder: ADDER_IMPLEMENTED_TEXT,
			written: { [ADD_PYTEST_FILE]: ADD_RAISES_TEST_TEXT },
		})

		await expect(
			runPytestCases({ root, files: [ADD_PYTEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				cases: [
					{
						name: 'test_rejects_negative',
						state: 'failed',
						errors: [{ name: 'Failed', message: expect.stringContaining('DID NOT RAISE') }],
					},
				],
			},
		])
	})

	it('a fixture raising at setup → the case failed with the fixture error', async () => {
		const root = createPythonPackage({ written: { [ADD_PYTEST_FILE]: SETUP_ERROR_TEST_TEXT } })

		await expect(
			runPytestCases({ root, files: [ADD_PYTEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				cases: [
					{
						name: 'test_uses_broken',
						state: 'failed',
						errors: [{ name: 'RuntimeError', message: expect.stringContaining('boom') }],
					},
				],
			},
		])
	})

	it('an import of a name the module lacks → the file has an ImportError naming it and no case', async () => {
		const root = packageWith({
			adder: ADDER_IMPLEMENTED_TEXT,
			written: { [ADD_PYTEST_FILE]: ADD_MISSING_EXPORT_PYTEST_TEXT },
		})

		await expect(
			runPytestCases({ root, files: [ADD_PYTEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				cases: [],
				errors: [
					{ name: 'ImportError', message: expect.stringContaining("cannot import name 'nope'") },
				],
			},
		])
	})

	it('a syntax error in the test file → the file has a SyntaxError and no case', async () => {
		const root = createPythonPackage({ written: { [ADD_PYTEST_FILE]: SYNTAX_ERROR_TEST_TEXT } })

		await expect(
			runPytestCases({ root, files: [ADD_PYTEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([{ cases: [], errors: [{ name: 'SyntaxError' }] }])
	})

	it('an unexpected indent in the test file → the file has an IndentationError and no case', async () => {
		const root = createPythonPackage({
			written: { [ADD_PYTEST_FILE]: INDENTATION_ERROR_TEST_TEXT },
		})

		await expect(
			runPytestCases({ root, files: [ADD_PYTEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([{ cases: [], errors: [{ name: 'IndentationError' }] }])
	})

	it('a parameter id holding > → the case failed, its reason saying it cannot be mapped back to a node id', async () => {
		const root = createPythonPackage({ written: { [IDS_TEST_FILE]: IDS_TEST_TEXT } })

		await expect(
			runPytestCases({ root, files: [IDS_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				cases: [
					{
						name: 'test_id[a > b]',
						state: 'failed',
						errors: [{ message: expect.stringMatching(/node id/) }],
					},
				],
			},
		])
	})
})

describe(
	'runPytestCases runs pytest the way the package does',
	{ timeout: PYTHON_RUN_CASE_TIMEOUT },
	() => {
		it('a case reading a data file, importing a helper, under a conftest → the file reports all three as its dependencies', async () => {
			const root = packageWith({
				adder: ADDER_IMPLEMENTED_TEXT,
				written: {
					[CONFTEST_FILE]: CONFTEST_TEXT,
					[HELPERS_FILE]: HELPERS_TEXT,
					[FIXTURE_FILE]: FIXTURE_TEXT,
					[READS_TEST_FILE]: READS_TEST_TEXT,
				},
			})

			await expect(
				runPytestCases({ root, files: [READS_TEST_FILE], filter: 'all' }),
			).resolves.toMatchObject([
				{
					dependencies: expect.arrayContaining([
						expect.stringMatching(/\/tests\/conftest\.py$/),
						expect.stringMatching(/\/tests\/helpers\.py$/),
						expect.stringMatching(/\/tests\/fixtures\/one\.xml$/),
					]),
				},
			])
		})

		it('a run → no __pycache__ and no .pytest_cache anywhere in the package afterwards', async () => {
			const root = packageWith({
				adder: ADDER_IMPLEMENTED_TEXT,
				written: { [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT, [HELPERS_FILE]: HELPERS_TEXT },
			})

			await expect(
				runPytestCases({ root, files: [ADD_PYTEST_FILE], filter: 'all' }),
			).resolves.toMatchObject([{ cases: [{ name: 'test_one', state: 'passed' }] }])

			expect(foldersNamed({ root, names: PYTHON_CACHE_FOLDER_NAMES })).toEqual([])
			expect(foldersNamed({ root: PLUGIN_FOLDER, names: PYTHON_CACHE_FOLDER_NAMES })).toEqual([])
		})

		it('files under two pytest folders, each with its own configuration → one module per folder, collected by its own configuration', async () => {
			const root = createPythonPackage({
				written: {
					'a/pyproject.toml': FOLDER_A_TOML_TEXT,
					[FOLDER_A_TEST_FILE]: FOLDER_A_TEST_TEXT,
					'b/pytest.ini': FOLDER_B_INI_TEXT,
					[FOLDER_B_TEST_FILE]: FOLDER_B_TEST_TEXT,
				},
			})

			await expect(
				runPytestCases({ root, files: [FOLDER_A_TEST_FILE, FOLDER_B_TEST_FILE], filter: 'all' }),
			).resolves.toMatchObject([
				{ file: expect.stringMatching(/\/a\/test_first\.py$/), cases: [{ name: 'check_one' }] },
				{ file: expect.stringMatching(/\/b\/test_second\.py$/), cases: [{ name: 'test_two' }] },
			])
		})

		it('a .venv/bin/python in the pytest folder → the run goes through that interpreter', async () => {
			const root = packageWith({
				adder: ADDER_IMPLEMENTED_TEXT,
				written: { [ADD_PYTEST_FILE]: ADD_ONE_PYTEST_TEXT },
			})
			const log = join(temporaryFolder('dialecte-py-log-'), 'used.log')
			installInterpreter({ root, folder: '', script: loggingInterpreter({ log }) })

			await expect(
				runPytestCases({ root, files: [ADD_PYTEST_FILE], filter: 'all' }),
			).resolves.toMatchObject([{ cases: [{ name: 'test_one', state: 'passed' }] }])

			expect(readFileSync(log, 'utf8')).toContain('used')
		})

		it('addopts asking for two xdist workers, an interpreter that has pytest-xdist → the cases run in the process and are reported', async (context) => {
			const python = findXdistPython()
			if (!python) return context.skip(XDIST_SKIP_REASON)
			const root = createPythonPackage({
				committed: { 'pyproject.toml': XDIST_TOML_TEXT },
				written: { [ROWS_TEST_FILE]: ROWS_PARAMETRIZED_TEST_TEXT },
			})
			installInterpreter({ root, folder: '', script: forwardingInterpreter({ target: python }) })

			await expect(
				runPytestCases({ root, files: [ROWS_TEST_FILE], filter: 'all' }),
			).resolves.toMatchObject([
				{
					cases: [
						{ name: 'TestRows > test_row[1]', state: 'passed' },
						{ name: 'TestRows > test_row[2]', state: 'passed' },
						{ name: 'test_pairs[1-2]', state: 'passed' },
						{ name: 'test_pairs[3-4]', state: 'passed' },
						{ name: 'test_stacked[7-3]', state: 'passed' },
					],
				},
			])
		})
	},
)

describe(
	'runPytestCases answers a failure when it cannot run',
	{ timeout: PYTHON_RUN_CASE_TIMEOUT },
	() => {
		it('a .venv python that imports no pytest → a failure naming the pytest folder and the interpreter error', async () => {
			const root = createPythonPackage({
				committed: { 'python/pyproject.toml': TOML_PYTEST_TEXT },
				written: { 'python/tests/test_a.py': TRIVIAL_TEST_TEXT },
			})
			installInterpreter({ root, folder: 'python', script: WITHOUT_PYTEST_INTERPRETER_TEXT })

			await expect(
				runPytestCases({ root, files: ['python/tests/test_a.py'], filter: 'all' }),
			).resolves.toMatchObject({
				failure: expect.stringMatching(
					/^pytest is not installed for python\/ \(.*No module named pytest\)/,
				),
			})
		})

		it('a run that prints a line then stays silent with no CPU gained for stallAfter → a failure naming pytest, the line relayed in its tail', async () => {
			const root = createPythonPackage({ written: { [ADD_PYTEST_FILE]: TRIVIAL_TEST_TEXT } })
			installInterpreter({ root, folder: '', script: HANGING_INTERPRETER_TEXT })
			const clock = createFakeClock()
			const tree = createFakeTree()

			const assertion = expect(
				runPytestCases({
					root,
					files: [ADD_PYTEST_FILE],
					filter: 'all',
					clock,
					watchdog: { stallAfter: 60_000, checkEvery: 10_000, ...tree },
				}),
			).resolves.toMatchObject({
				failure: expect.stringMatching(/^pytest [\s\S]*stalled/),
				tail: expect.arrayContaining(['collecting tests']),
			})
			try {
				await Promise.race([waitForHangingInterpreter({ root }), assertion])
				clock.advance(70_000)
				await assertion
			} finally {
				stopHangingInterpreter({ root })
			}
		})
	},
)
