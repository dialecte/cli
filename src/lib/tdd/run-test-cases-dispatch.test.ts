/**
 * `runTestCases` as the dispatcher: the files grouped by the runner each one runs under, every runner called once
 * with its own files, the modules concatenated in runner order, the first failure answered. The runners are fakes:
 * no process is spawned.
 */
import { createFakeClock } from '../../../test/fake-clock.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { CONFIG_READ_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runTestCases } from './run-test-cases.ts'

import { describe, expect, it, vi } from 'vitest'

import type { ReportedModule, RunnerFunction, TestRunFailure, TestRunner } from './tdd.types.ts'

const VITEST_FILE = 'src/add.test.ts'
const NODE_FILE = 'src/subtract.test.ts'
const PYTHON_FILE = 'python/tests/test_multiply.py'
const SPEC_FILE = 'e2e/divide.spec.ts'

const PACKAGE_FILES: Record<string, string> = {
	'package.json': '{"name":"demo"}\n',
	'vitest.config.ts': "export default { test: { include: ['src/**/*.test.ts'] } }\n",
	[VITEST_FILE]: "import { it } from 'vitest'\n\nit('adds', () => undefined)\n",
	[NODE_FILE]: "import { test } from 'node:test'\n\ntest('subtracts', () => undefined)\n",
	[PYTHON_FILE]: 'def test_multiplies():\n    assert 2 * 3 == 6\n',
	[SPEC_FILE]: "import { it } from 'vitest'\n\nit('divides', () => undefined)\n",
}

/** The tests run in a folder of their own: the dispatcher reads each file's text and the vitest configs. */
function createPackage(): string {
	const root = temporaryFolder('dialecte-dispatch-')
	writeFiles({ root, files: PACKAGE_FILES })
	return root
}

function moduleOf(params: { file: string; runner: TestRunner }): ReportedModule {
	return { file: params.file, runner: params.runner, errors: [], cases: [] }
}

/** A fake runner that answers one module per file it is given, tagged with its own runner. */
function answeringModules(runner: TestRunner): RunnerFunction {
	return async function answer(params) {
		return params.files.map((file) => moduleOf({ file, runner }))
	}
}

function answeringFailure(failure: TestRunFailure): RunnerFunction {
	return async function answer() {
		return failure
	}
}

function fakeRunners(): Record<TestRunner, ReturnType<typeof vi.fn<RunnerFunction>>> {
	return {
		vitest: vi.fn<RunnerFunction>(answeringModules('vitest')),
		node: vi.fn<RunnerFunction>(answeringModules('node')),
		pytest: vi.fn<RunnerFunction>(answeringModules('pytest')),
	}
}

describe('runTestCases dispatches by runner', () => {
	it(
		'a vitest file, a node:test file and a pytest file → each runner called once with its own file, the modules in runner order each naming its runner',
		{ timeout: CONFIG_READ_CASE_TIMEOUT },
		async () => {
			const root = createPackage()
			const runners = fakeRunners()

			await expect(
				runTestCases({
					root,
					files: [PYTHON_FILE, NODE_FILE, VITEST_FILE],
					filter: 'all',
					runners,
				}),
			).resolves.toEqual([
				moduleOf({ file: VITEST_FILE, runner: 'vitest' }),
				moduleOf({ file: NODE_FILE, runner: 'node' }),
				moduleOf({ file: PYTHON_FILE, runner: 'pytest' }),
			])
			expect(runners.vitest).toHaveBeenCalledTimes(1)
			expect(runners.vitest.mock.calls[0]?.[0].files).toEqual([VITEST_FILE])
			expect(runners.node).toHaveBeenCalledTimes(1)
			expect(runners.node.mock.calls[0]?.[0].files).toEqual([NODE_FILE])
			expect(runners.pytest).toHaveBeenCalledTimes(1)
			expect(runners.pytest.mock.calls[0]?.[0].files).toEqual([PYTHON_FILE])
		},
	)

	it(
		'a list of vitest files only → only the vitest runner is called, with every file',
		{ timeout: CONFIG_READ_CASE_TIMEOUT },
		async () => {
			const root = createPackage()
			const runners = fakeRunners()

			await expect(
				runTestCases({
					root,
					files: [VITEST_FILE],
					filter: 'all',
					runners,
				}),
			).resolves.toEqual([moduleOf({ file: VITEST_FILE, runner: 'vitest' })])
			expect(runners.vitest).toHaveBeenCalledTimes(1)
			expect(runners.node).not.toHaveBeenCalled()
			expect(runners.pytest).not.toHaveBeenCalled()
		},
	)

	it(
		'the root, the filter and the bound asked → each runner receives them unchanged',
		{ timeout: CONFIG_READ_CASE_TIMEOUT },
		async () => {
			const root = createPackage()
			const runners = fakeRunners()

			await expect(
				runTestCases({
					root,
					files: [VITEST_FILE, PYTHON_FILE],
					filter: { names: ['adds'] },
					timeoutMs: 1234,
					runners,
				}),
			).resolves.toHaveLength(2)

			expect(runners.vitest.mock.calls[0]?.[0]).toMatchObject({
				root,
				filter: { names: ['adds'] },
				timeoutMs: 1234,
			})
			expect(runners.pytest.mock.calls[0]?.[0]).toMatchObject({
				root,
				filter: { names: ['adds'] },
				timeoutMs: 1234,
			})
		},
	)

	it(
		'a spec no config includes beside a vitest file → no runner is given the spec',
		{ timeout: CONFIG_READ_CASE_TIMEOUT },
		async () => {
			const root = createPackage()
			const runners = fakeRunners()

			await expect(
				runTestCases({
					root,
					files: [SPEC_FILE, VITEST_FILE],
					filter: 'all',
					runners,
				}),
			).resolves.toEqual([moduleOf({ file: VITEST_FILE, runner: 'vitest' })])
			expect(runners.vitest.mock.calls[0]?.[0].files).toEqual([VITEST_FILE])
		},
	)

	it(
		'only a spec no config includes → no runner is called and no module answered',
		{ timeout: CONFIG_READ_CASE_TIMEOUT },
		async () => {
			const root = createPackage()
			const runners = fakeRunners()

			await expect(
				runTestCases({ root, files: [SPEC_FILE], filter: 'all', runners }),
			).resolves.toEqual([])
			expect(runners.vitest).not.toHaveBeenCalled()
			expect(runners.node).not.toHaveBeenCalled()
			expect(runners.pytest).not.toHaveBeenCalled()
		},
	)

	it(
		'the node runner answers a failure → that failure, its text naming node, and its tail kept',
		{ timeout: CONFIG_READ_CASE_TIMEOUT },
		async () => {
			const root = createPackage()
			const runners = fakeRunners()
			runners.node.mockImplementation(
				answeringFailure({ failure: 'wrote no report (exit 1):', tail: ['boom'] }),
			)

			await expect(
				runTestCases({
					root,
					files: [VITEST_FILE, NODE_FILE],
					filter: 'all',
					runners,
				}),
			).resolves.toMatchObject({
				failure: expect.stringMatching(/node[\s\S]*wrote no report \(exit 1\):/),
				tail: ['boom'],
			})
		},
	)

	it(
		'the vitest runner answers a failure → that failure, naming vitest, and the node and pytest runners are not called',
		{ timeout: CONFIG_READ_CASE_TIMEOUT },
		async () => {
			const root = createPackage()
			const runners = fakeRunners()
			runners.vitest.mockImplementation(answeringFailure({ failure: 'first failure' }))

			await expect(
				runTestCases({
					root,
					files: [PYTHON_FILE, NODE_FILE, VITEST_FILE],
					filter: 'all',
					runners,
				}),
			).resolves.toMatchObject({
				failure: expect.stringMatching(/vitest[\s\S]*first failure/),
			})
			expect(runners.node).not.toHaveBeenCalled()
			expect(runners.pytest).not.toHaveBeenCalled()
		},
	)

	it(
		'the clock and the watchdog asked → each runner receives the very same ones',
		{ timeout: CONFIG_READ_CASE_TIMEOUT },
		async () => {
			const root = createPackage()
			const runners = fakeRunners()
			const clock = createFakeClock()
			const watchdog = { stallAfter: 77 }

			await expect(
				runTestCases({
					root,
					files: [VITEST_FILE, NODE_FILE, PYTHON_FILE],
					filter: 'all',
					clock,
					watchdog,
					runners,
				}),
			).resolves.toHaveLength(3)

			for (const runner of [runners.vitest, runners.node, runners.pytest]) {
				expect(runner.mock.calls[0]?.[0].clock).toBe(clock)
				expect(runner.mock.calls[0]?.[0].watchdog).toBe(watchdog)
			}
		},
	)
})
