/**
 * Runs test cases of a package: each test file goes to the runner it is written for (`runnerOf`: pytest, node
 * --test, vitest), each runner runs its files once, in the order vitest, node, pytest, and the modules they report
 * are answered together. A file of no runner is given to none (it leaves the selection). The first runner that
 * cannot run answers for the whole run, named with its runner: the later runners are not started.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { runNodeCases } from './run-node-cases.ts'
import { runPytestCases } from './run-pytest-cases.ts'
import { runVitestCases } from './run-vitest-cases.ts'
import { groupFilesByRunner } from './test-runner.ts'
import { readVitestConfigs } from './vitest-configs.ts'

import type {
	ChangedTestFile,
	ReportedModule,
	RunnerFunction,
	RunnerParams,
	TestRunFailure,
	TestRunner,
} from './tdd.types.ts'

export async function runTestCases(
	params: RunnerParams & {
		/** The runner of each kind of test file. Default: the real ones. */
		runners?: Partial<Record<TestRunner, RunnerFunction>>
	},
): Promise<ReportedModule[] | TestRunFailure> {
	const { runners, ...runnerParams } = params
	const { groups } = groupFilesByRunner({
		root: params.root,
		files: params.files.map((file) => testFileOf({ root: params.root, file })),
		configs: readVitestConfigs({ root: params.root }),
	})
	const modules: ReportedModule[] = []
	for (const group of groups) {
		const run = runners?.[group.runner] ?? defaultRunner(group.runner)
		const reported = await run({ ...runnerParams, files: group.files })
		if ('failure' in reported) return namedFailure({ runner: group.runner, failure: reported })
		modules.push(...reported)
	}
	return modules
}

/** A test file with its text as it is now (empty when it is gone: its name alone decides then). */
function testFileOf(params: { root: string; file: string }): ChangedTestFile {
	const path = join(params.root, params.file)
	return {
		file: params.file,
		text: existsSync(path) ? readFileSync(path, 'utf8') : '',
		baseText: undefined,
	}
}

/** The cli's own runner of each kind of test file. */
function defaultRunner(runner: TestRunner): RunnerFunction {
	if (runner === 'vitest') return runVitestCases
	if (runner === 'node') return runNodeCases
	return runPytestCases
}

/** The failure, opening with the runner's name unless it already does. */
function namedFailure(params: { runner: TestRunner; failure: TestRunFailure }): TestRunFailure {
	const { runner, failure } = params
	return failure.failure.startsWith(`${runner} `)
		? failure
		: { ...failure, failure: `${runner}: ${failure.failure}` }
}
