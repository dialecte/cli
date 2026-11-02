import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FAKE_VITEST } from '../../../test/fake-vitest.constants.ts'
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { runGateSteps } from './run-gate.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'

/** A package folder holding the stand-in (as `vitest` and as `runner`) in the given mode. */
function packageIn(
	mode: 'flaky' | 'broken' | 'unhandled' | 'counts' | 'empty' | 'counted' | 'diff',
): string {
	const root = temporaryFolder('dialecte-gate-rerun-')
	writeFiles({ root, files: { vitest: FAKE_VITEST, runner: FAKE_VITEST, mode } })
	return root
}

function calls(root: string): string[] {
	return readFileSync(join(root, 'calls.txt'), 'utf8').trim().split('\n')
}

async function runSteps(params: { root: string; steps: GateStep[]; packageJson?: PackageJson }) {
	return runGateSteps({
		root: params.root,
		steps: params.steps,
		packageJson: params.packageJson ?? {},
	})
}

const TESTS_STEP: GateStep = { name: 'tests', run: 'sh ./vitest run', counts: 'tests' }

describe(
	'runGateSteps: a failing vitest test step is rerun once, serially',
	{ timeout: 30_000 },
	() => {
		it('fails in parallel, passes serially → rerun on its failing files with --no-file-parallelism, the step passes flagged flaky', async () => {
			const root = packageIn('flaky')

			const [result] = await runSteps({ root, steps: [TESTS_STEP] })

			// the files in the order the first run's output names them, each once
			expect(calls(root)).toEqual([
				'run',
				'run src/c.test.ts src/a.test.ts src/b.test.ts --no-file-parallelism',
			])
			expect(result).toMatchObject({
				status: 'passed',
				exitCode: 1,
				counts: { tests: { passed: 40, failed: 2, skipped: 0, total: 42 } },
				note: 'flaky in parallel',
				rerun: {
					files: ['src/c.test.ts', 'src/a.test.ts', 'src/b.test.ts'],
					failing: [],
					status: 'passed',
					exitCode: 0,
					counts: { tests: { passed: 3, failed: 0, skipped: 0, total: 3 } },
				},
			})
			expect(result?.reason).toBeUndefined()
		})

		it('fails serially too → the step fails as a real failure, the tail is the serial run’s', async () => {
			const root = packageIn('broken')

			const [result] = await runSteps({ root, steps: [TESTS_STEP] })

			expect(calls(root)).toEqual([
				'run',
				'run src/c.test.ts src/a.test.ts src/b.test.ts --no-file-parallelism',
			])
			expect(result).toMatchObject({
				status: 'failed',
				exitCode: 1,
				reason: 'real failure: exit 1',
				tail: expect.stringContaining('the serial run failed here'),
				rerun: {
					files: ['src/c.test.ts', 'src/a.test.ts', 'src/b.test.ts'],
					failing: ['src/a.test.ts'],
					status: 'failed',
					exitCode: 1,
				},
			})
			expect(result?.note).toBeUndefined()
			expect(result?.tail).not.toContain('Error: boom')
		})

		it('exits 0 with a failed test counted → rerun as a failure; its serial run passes → flaky', async () => {
			const root = packageIn('counts')

			const [result] = await runSteps({ root, steps: [TESTS_STEP] })

			expect(calls(root)).toEqual([
				'run',
				'run src/c.test.ts src/a.test.ts src/b.test.ts --no-file-parallelism',
			])
			expect(result).toMatchObject({
				status: 'passed',
				exitCode: 0,
				note: 'flaky in parallel',
				rerun: { status: 'passed', exitCode: 0 },
			})
		})

		it('the serial run exits 0 with a failed test counted → a real failure, not a flake', async () => {
			const root = packageIn('counted')

			const [result] = await runSteps({ root, steps: [TESTS_STEP] })

			expect(result).toMatchObject({
				status: 'failed',
				reason: 'real failure: 1 test(s) failed',
				rerun: { status: 'failed', exitCode: 0 },
			})
			expect(result?.note).toBeUndefined()
		})

		it('the serial run exits 0 but runs no test → a real failure, not a flake', async () => {
			const root = packageIn('empty')

			const [result] = await runSteps({ root, steps: [TESTS_STEP] })

			expect(result).toMatchObject({
				status: 'failed',
				reason: 'real failure: no test ran',
				rerun: { status: 'failed', exitCode: 0 },
			})
			expect(result?.note).toBeUndefined()
		})

		it('through npm run → the words go after one --, added only when the command has none', async () => {
			const root = packageIn('flaky')
			const packageJson = { scripts: { 'test:node': 'sh ./vitest run --project node' } }
			writeFiles({ root, files: { 'package.json': JSON.stringify(packageJson) } })

			await runSteps({
				root,
				packageJson,
				steps: [{ name: 'tests', run: 'npm run test:node', counts: 'tests' }],
			})
			await runSteps({
				root,
				packageJson,
				steps: [{ name: 'tests', run: 'npm run test:node -- --bail=0', counts: 'tests' }],
			})

			expect(calls(root)).toEqual([
				'run --project node',
				'run --project node src/c.test.ts src/a.test.ts src/b.test.ts --no-file-parallelism',
				'run --project node --bail=0',
				'run --project node --bail=0 src/c.test.ts src/a.test.ts src/b.test.ts --no-file-parallelism',
			])
		})

		it('no failing file named (an error outside the test files) → the whole command rerun with --no-file-parallelism', async () => {
			const root = packageIn('unhandled')

			const [result] = await runSteps({ root, steps: [TESTS_STEP] })

			expect(calls(root)).toEqual(['run', 'run --no-file-parallelism'])
			expect(result).toMatchObject({
				status: 'passed',
				note: 'flaky in parallel',
				rerun: { files: [], failing: [], status: 'passed', exitCode: 0 },
			})
		})

		it('a step that counts no tests, a test step that runs no vitest, a passing test step → run once, never rerun', async () => {
			const failing = packageIn('broken')
			const otherRunner = packageIn('broken')
			// the stand-in passes when told to run serially
			const passing = packageIn('flaky')

			const [check] = await runSteps({
				root: failing,
				steps: [{ name: 'check', run: 'sh ./vitest run' }],
			})
			const [nodeTest] = await runSteps({
				root: otherRunner,
				steps: [{ name: 'tests', run: 'sh ./runner --test', counts: 'tests' }],
			})
			const [passed] = await runSteps({
				root: passing,
				steps: [{ name: 'tests', run: 'sh ./vitest run --no-file-parallelism', counts: 'tests' }],
			})

			expect([calls(failing), calls(otherRunner), calls(passing)]).toEqual([
				['run'],
				['--test'],
				['run --no-file-parallelism'],
			])
			expect([check?.status, nodeTest?.status, passed?.status]).toEqual([
				'failed',
				'failed',
				'passed',
			])
			expect([check?.rerun, nodeTest?.rerun, passed?.rerun]).toEqual([
				undefined,
				undefined,
				undefined,
			])
		})

		it('a test step through npm run whose script runs no vitest → run once, never rerun', async () => {
			const root = packageIn('broken')
			const packageJson = { scripts: { 'test:node': 'sh ./runner --test' } }
			writeFiles({ root, files: { 'package.json': JSON.stringify(packageJson) } })

			const [result] = await runSteps({
				root,
				packageJson,
				steps: [{ name: 'tests', run: 'npm run test:node', counts: 'tests' }],
			})

			expect(calls(root)).toEqual(['--test'])
			expect(result).toMatchObject({ status: 'failed', reason: 'exit 1' })
			expect(result?.rerun).toBeUndefined()
		})

		it('a FAIL line that is no vitest file line (a gate line in a diff) → not taken for a failing file', async () => {
			const root = packageIn('diff')

			const [result] = await runSteps({ root, steps: [TESTS_STEP] })

			expect(calls(root)).toEqual([
				'run',
				'run src/c.test.ts src/a.test.ts src/b.test.ts --no-file-parallelism',
			])
			expect(result?.rerun?.files).toEqual(['src/c.test.ts', 'src/a.test.ts', 'src/b.test.ts'])
		})

		it('a step that already runs one file at a time → run once, never rerun', async () => {
			const root = packageIn('broken')

			const [result] = await runSteps({
				root,
				steps: [{ name: 'tests', run: 'sh ./vitest run --no-file-parallelism', counts: 'tests' }],
			})

			expect(calls(root)).toEqual(['run --no-file-parallelism'])
			expect(result).toMatchObject({ status: 'failed', reason: 'exit 1' })
			expect(result?.rerun).toBeUndefined()
		})

		it('one file at a time through the npm script, or as --fileParallelism=false → run once, never rerun', async () => {
			const throughScript = packageIn('broken')
			const packageJson = { scripts: { 'test:serial': 'sh ./vitest run --no-file-parallelism' } }
			writeFiles({ root: throughScript, files: { 'package.json': JSON.stringify(packageJson) } })
			const asOption = packageIn('broken')

			const [script] = await runSteps({
				root: throughScript,
				packageJson,
				steps: [{ name: 'tests', run: 'npm run test:serial', counts: 'tests' }],
			})
			const [option] = await runSteps({
				root: asOption,
				steps: [{ name: 'tests', run: 'sh ./vitest run --fileParallelism=false', counts: 'tests' }],
			})

			expect([calls(throughScript), calls(asOption)]).toEqual([
				['run --no-file-parallelism'],
				['run --fileParallelism=false'],
			])
			expect([script?.rerun, option?.rerun]).toEqual([undefined, undefined])
		})
	},
)
