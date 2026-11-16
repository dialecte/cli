/**
 * The runner of each test file, inferred from the file and the package: a Python file pytest collects runs under
 * pytest, a JS/TS test file importing `node:test` under `node --test`, a JS/TS test file a vitest config holds
 * under vitest; any other file runs under no known runner.
 */
import { isPytestTestFile } from './pytest-test-file.ts'
import { NODE_TEST_SPECIFIER, RUNNER_ORDER, TEST_FILE_PATTERN } from './tdd.constants.ts'
import { moduleSpecifiers } from './test-source.ts'
import { configHolding } from './vitest-configs.ts'

import type { ChangedTestFile, RunnerGroups, TestRunner, VitestConfigs } from './tdd.types.ts'

/**
 * The runner of one test file of the package at `root`: pytest for a Python file pytest collects
 * (`isPytestTestFile`); node for a JS/TS test file that loads `node:test` (a type-only import or a `vi.mock` does
 * not); vitest for one a vitest config holds or may hold (unknown fails closed); none otherwise.
 */
export function runnerOf(params: {
	root: string
	file: string
	text: string
	configs: VitestConfigs
}): TestRunner | undefined {
	const { file } = params
	if (isPytestTestFile(params)) return 'pytest'
	if (!TEST_FILE_PATTERN.test(file)) return undefined
	const loaded = moduleSpecifiers({ text: params.text, file, valuesOnly: true })
	if (loaded.includes(NODE_TEST_SPECIFIER)) return 'node'
	return configHolding({ configs: params.configs, path: file }).kind === 'none'
		? undefined
		: 'vitest'
}

/** The files split by runner (one group per runner that has files, in the fixed runner order), and the files of none. */
export function groupFilesByRunner(params: {
	root: string
	files: readonly ChangedTestFile[]
	configs: VitestConfigs
}): RunnerGroups {
	const filesByRunner = new Map<TestRunner, string[]>()
	const outside: string[] = []
	for (const changed of params.files) {
		const runner = runnerOf({
			root: params.root,
			file: changed.file,
			text: changed.text,
			configs: params.configs,
		})
		if (runner === undefined) outside.push(changed.file)
		else filesByRunner.set(runner, [...(filesByRunner.get(runner) ?? []), changed.file])
	}
	const groups = RUNNER_ORDER.flatMap(function groupOf(runner) {
		const files = filesByRunner.get(runner)
		return files ? [{ runner, files }] : []
	})
	return { groups, outside }
}
