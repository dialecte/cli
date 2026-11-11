import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runGateSteps } from '../src/lib/gate/run-gate.ts'
import {
	createScratchRepository as scratchRepository,
	temporaryFolder,
} from './scratch-repository.ts'
import { GATE_REAL_TOOLS_CASE_TIMEOUT } from './test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

/** The cli's own repository: its node_modules hold the real vitest, oxlint and tsc the gate reads. */
const CLI_ROOT = join(import.meta.dirname, '..')

function scratchFolder(files: Record<string, string>): string {
	const folder = temporaryFolder('dialecte-gate-')
	for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), content)
	return folder
}

// each case spawns the real tools through npx: slower than a unit test when the suite runs in parallel
describe('runGateSteps on the real tools', { timeout: GATE_REAL_TOOLS_CASE_TIMEOUT }, () => {
	it('vitest: 2 passed and 1 skipped → passed with those counts; 1 failing → failed', async () => {
		const green = scratchFolder({
			'demo.test.js': "test('a', () => {})\ntest('b', () => {})\ntest.skip('c', () => {})\n",
		})
		const red = scratchFolder({
			'demo.test.js': "test('a', () => {})\ntest('b', () => { expect(1).toBe(2) })\n",
		})

		const [greenResult, redResult] = await Promise.all(
			[green, red].map(
				async (folder) =>
					(
						await runGateSteps({
							root: CLI_ROOT,
							steps: [
								{
									name: 'tests',
									run: `npx vitest run --root ${folder} --globals`,
									counts: 'tests',
								},
							],
							packageJson: {},
						})
					)[0],
			),
		)

		expect(greenResult).toMatchObject({
			status: 'passed',
			counts: {
				tests: { passed: 2, failed: 0, skipped: 1, total: 3 },
				testFiles: { passed: 1, failed: 0, total: 1 },
			},
		})
		expect(redResult).toMatchObject({
			status: 'failed',
			exitCode: 1,
			counts: { tests: { passed: 1, failed: 1, skipped: 0, total: 2 } },
		})
	})

	it('tsc and oxlint, piped as in npm run check: their errors and warnings are counted', async () => {
		const folder = scratchFolder({
			'broken.ts': 'const value: number = "text"\nexport { value }\ndebugger\n',
			'tsconfig.json': JSON.stringify({
				compilerOptions: { strict: true, noEmit: true },
				files: ['broken.ts'],
			}),
		})

		const [typeCheck, lint] = await Promise.all(
			[
				{ name: 'type-check', run: `npx tsc -p ${join(folder, 'tsconfig.json')}` },
				{ name: 'lint', run: `npx oxlint ${join(folder, 'broken.ts')}` },
			].map(
				async (step) => (await runGateSteps({ root: CLI_ROOT, steps: [step], packageJson: {} }))[0],
			),
		)

		expect(typeCheck).toMatchObject({ status: 'failed', exitCode: 1, counts: { errors: 1 } })
		expect(lint).toMatchObject({ status: 'passed', counts: { errors: 0, warnings: 1 } })
	})

	it('node --test (spec reporter, as create runs it): 1 passed, 1 failed, 1 skipped → failed with those counts', async () => {
		const folder = scratchFolder({
			'demo.test.mjs': [
				"import test from 'node:test'",
				"test('a', () => {})",
				"test('b', () => { throw new Error('red') })",
				"test.skip('c', () => {})",
				'',
			].join('\n'),
		})

		const [result] = await runGateSteps({
			root: CLI_ROOT,
			steps: [
				{
					name: 'tests',
					run: `node --test --test-reporter=spec ${join(folder, 'demo.test.mjs')}`,
					counts: 'tests',
				},
			],
			packageJson: {},
		})

		expect(result).toMatchObject({
			status: 'failed',
			counts: { tests: { passed: 1, failed: 1, skipped: 1, total: 3 } },
		})
	})

	it('vitest --changed on a change that touches no test (a doc edit) → passed with a note; the same output without changedOnly → failed, its serial rerun too', async () => {
		const folder = scratchRepository({
			'demo.test.js': "test('a', () => {})\n",
			'README.md': '# Demo\n',
		})
		writeFileSync(join(folder, 'README.md'), '# Demo\n\nMore words.\n')
		const run = `npx vitest run --root ${folder} --globals --changed`

		const [changedOnly, plain] = await Promise.all(
			[true, false].map(
				async (flag) =>
					(
						await runGateSteps({
							root: CLI_ROOT,
							steps: [{ name: 'tests', run, counts: 'tests', ...(flag && { changedOnly: true }) }],
							packageJson: {},
						})
					)[0],
			),
		)

		expect(changedOnly).toMatchObject({
			status: 'passed',
			exitCode: 0,
			note: 'no test file is affected by the change',
		})
		expect(plain).toMatchObject({
			status: 'failed',
			reason: 'real failure: no test ran',
			rerun: { files: [], failing: [], status: 'failed', exitCode: 0 },
		})
	})
})
