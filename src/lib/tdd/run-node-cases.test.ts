import {
	ADD_FILE,
	ADD_IMPLEMENTED_TEXT,
	ADD_ONE_TEST_TEXT,
	ADD_MISSING_EXPORT_TEST_TEXT,
	ADD_STUB_TEXT,
	ADD_TEST_FILE,
	ADD_TWO_TEST_TEXT,
	LOOP_TEST_FILE,
	MIXED_TEST_FILE,
	MIXED_TEST_TEXT,
	MISSING_TEST_FILE,
	NESTED_TEST_FILE,
	NESTED_TEST_TEXT,
	NODE_RUN_CASE_TIMEOUT,
	PASSING_LOOP_TEST_TEXT,
	SKIPS_ONLY_TEST_FILE,
	SKIPS_ONLY_TEST_TEXT,
	SLOW_TEST_FILE,
	SLOW_TEST_TEXT,
	THROWING_DESCRIBE_TEST_TEXT,
	THROWING_TEST_FILE,
} from '../../../test/tdd-runners-node-workspace.constants.ts'
import { createNodePackage } from '../../../test/tdd-runners-node-workspace.ts'
import { runNodeCases } from './run-node-cases.ts'
import { MISSING_EXPORT_PATTERN, TIMEOUT_PATTERN } from './tdd.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ReportedModule, TestRunFailure } from './tdd.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The frames of the first error of a run that sit in `src/add.ts` or `src/add.test.ts`, as `<file>:<line>`, in the order reported. */
function addFramesOf(result: ReportedModule[] | TestRunFailure): string[] {
	if ('failure' in result) return []
	const frames = result[0]?.cases[0]?.errors[0]?.frames ?? []
	return frames.flatMap(function addFrameOf(frame) {
		const matched = /(src\/add(?:\.test)?\.ts)$/.exec(frame.file)
		return matched ? [`${matched[1]}:${frame.line}`] : []
	})
}

/** A package whose working tree holds `files`. */
function packageWith(files: Record<string, string>): string {
	return createNodePackage({ written: files })
}

describe('runNodeCases reports what node --test saw', { timeout: NODE_RUN_CASE_TIMEOUT }, () => {
	it('a failing assertion, a passing case, a skip and a todo under describe add → each case named add > <title>, with its state, its place and the assertion error', async () => {
		const root = packageWith({ [MIXED_TEST_FILE]: MIXED_TEST_TEXT })

		await expect(
			runNodeCases({ root, files: [MIXED_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				file: expect.stringMatching(/src\/mixed\.test\.ts$/),
				runner: 'node',
				errors: [],
				cases: [
					{
						name: 'add > one',
						state: 'failed',
						project: '',
						location: { line: 4, column: 2 },
						errors: [{ name: 'AssertionError', message: '1 == 2' }],
					},
					{ name: 'add > two', state: 'passed', errors: [] },
					{ name: 'add > three', state: 'skipped', location: { line: 10, column: 5 } },
					{ name: 'add > four', state: 'pending' },
				],
			},
		])
	})

	it('a file of cases add > one and add > two, the filter naming add > two → only that case ran', async () => {
		const root = packageWith({
			[ADD_FILE]: ADD_IMPLEMENTED_TEXT,
			[ADD_TEST_FILE]: ADD_TWO_TEST_TEXT,
		})

		await expect(
			runNodeCases({ root, files: [ADD_TEST_FILE], filter: { names: ['add > two'] } }),
		).resolves.toMatchObject([{ cases: [{ name: 'add > two', state: 'passed' }] }])
	})

	it('a file of a failing case, a passing case, a skip and a todo, the filter asking to collect → all four ran, each with its real state', async () => {
		const root = packageWith({ [MIXED_TEST_FILE]: MIXED_TEST_TEXT })

		await expect(
			runNodeCases({ root, files: [MIXED_TEST_FILE], filter: 'collect' }),
		).resolves.toMatchObject([
			{
				cases: [
					{ name: 'add > one', state: 'failed' },
					{ name: 'add > two', state: 'passed' },
					{ name: 'add > three', state: 'skipped' },
					{ name: 'add > four', state: 'pending' },
				],
			},
		])
	})

	it('cases two describes deep → the name joins every title with >', async () => {
		const root = packageWith({ [NESTED_TEST_FILE]: NESTED_TEST_TEXT })

		await expect(
			runNodeCases({ root, files: [NESTED_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([{ cases: [{ name: 'outer > inner > deep', state: 'passed' }] }])
	})

	it('two cases made by one loop line → two names, one location', async () => {
		const root = packageWith({ [LOOP_TEST_FILE]: PASSING_LOOP_TEST_TEXT })

		await expect(
			runNodeCases({ root, files: [LOOP_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				cases: [
					{ name: 'row 1', location: { line: 2, column: 30 } },
					{ name: 'row 2', location: { line: 2, column: 30 } },
				],
			},
		])
	})

	it('a file of skips only → every case reported skipped', async () => {
		const root = packageWith({ [SKIPS_ONLY_TEST_FILE]: SKIPS_ONLY_TEST_TEXT })

		await expect(
			runNodeCases({ root, files: [SKIPS_ONLY_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([{ cases: [{ state: 'skipped' }, { state: 'skipped' }] }])
	})

	it('the stub of production code called inside assert.equal → the stub message, the production frame before the test frame', async () => {
		const root = packageWith({ [ADD_FILE]: ADD_STUB_TEXT, [ADD_TEST_FILE]: ADD_ONE_TEST_TEXT })

		await expect(
			runNodeCases({ root, files: [ADD_TEST_FILE], filter: 'all' }).then(addFramesOf),
		).resolves.toEqual(['src/add.ts:2', 'src/add.test.ts:6'])
	})

	it('the stub of production code called inside assert.equal → the error carries the stub message', async () => {
		const root = packageWith({ [ADD_FILE]: ADD_STUB_TEXT, [ADD_TEST_FILE]: ADD_ONE_TEST_TEXT })

		await expect(
			runNodeCases({ root, files: [ADD_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				cases: [
					{
						name: 'add > one',
						state: 'failed',
						errors: [{ message: 'not implemented: add' }],
					},
				],
			},
		])
	})

	it('a test file importing an export its module lacks → the module error names it, no case', async () => {
		const root = packageWith({
			[ADD_FILE]: ADD_IMPLEMENTED_TEXT,
			[ADD_TEST_FILE]: ADD_MISSING_EXPORT_TEST_TEXT,
		})

		await expect(
			runNodeCases({ root, files: [ADD_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{ errors: [{ message: expect.stringMatching(MISSING_EXPORT_PATTERN) }], cases: [] },
		])
	})

	it('a describe whose callback throws → the module error carries the thrown message, no case', async () => {
		const root = packageWith({ [THROWING_TEST_FILE]: THROWING_DESCRIBE_TEST_TEXT })

		await expect(
			runNodeCases({ root, files: [THROWING_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{ errors: [{ message: expect.stringContaining('describe blew') }], cases: [] },
		])
	})

	it('a case that outlives its timeout → failed, its message one the timeout pattern reads', async () => {
		const root = packageWith({ [SLOW_TEST_FILE]: SLOW_TEST_TEXT })

		await expect(
			runNodeCases({ root, files: [SLOW_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([
			{
				cases: [
					{
						name: 'add > slow',
						state: 'failed',
						errors: [{ message: expect.stringMatching(TIMEOUT_PATTERN) }],
					},
				],
			},
		])
	})

	it('a run started with NODE_TEST_CONTEXT in the environment → it still reports on its own', async () => {
		vi.stubEnv('NODE_TEST_CONTEXT', 'child-v8')
		const root = packageWith({ [NESTED_TEST_FILE]: NESTED_TEST_TEXT })

		await expect(
			runNodeCases({ root, files: [NESTED_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject([{ cases: [{ name: 'outer > inner > deep', state: 'passed' }] }])
	})

	it('a file node cannot find, so no report is written → a failure naming node', async () => {
		const root = packageWith({ [ADD_FILE]: ADD_IMPLEMENTED_TEXT })

		await expect(
			runNodeCases({ root, files: [MISSING_TEST_FILE], filter: 'all' }),
		).resolves.toMatchObject({ failure: expect.stringMatching(/\bnode\b/) })
	})
})
