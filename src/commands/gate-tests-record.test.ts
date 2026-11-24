/**
 * The gate part of a lot's `tests.json` (33CI CI2a): a gate run in the lot's worktree writes the counts of its newest
 * run that counted tests, and the tree it ran on; a run that counted none writes no part.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { addWorktreeFolder } from '../../test/lot-stores.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { STEP_LOT } from '../../test/step-events-lot.constants.ts'
import { createStepLot } from '../../test/step-events-lot.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runGate } from './gate.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A step that prints a test runner's summary: 3 tests passed, 1 skipped, in 2 files. */
const COUNTED_STEP = {
	name: 'unit',
	run: "printf ' Test Files  2 passed (2)\\n      Tests  3 passed | 1 skipped (4)\\n'",
	counts: 'tests' as const,
}

/** The lot folder's `tests.json` read as JSON; undefined without the file. */
function testsRecordOf(lotFolder: string): unknown {
	const file = join(lotFolder, STORE_FILES.tests)
	return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined
}

describe('gate - tests.json', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('gate --fast in the lot worktree, a step counting tests -> the gate part: mode, its counts, the tree', async () => {
		const lot = createStepLot({ fast: [COUNTED_STEP] })

		await runGate({ cwd: lot.worktree, argv: [] })

		expect(testsRecordOf(lot.lotFolder)).toEqual({
			schema: 1,
			gate: {
				mode: 'fast',
				at: expect.any(String),
				head: expect.stringMatching(/^[0-9a-f]{40}$/),
				stateHash: expect.stringMatching(/^[0-9a-f]{64}$/),
				tests: { passed: 3, failed: 0, skipped: 1, total: 4 },
				testFiles: { passed: 2, failed: 0, total: 2 },
				failures: [],
			},
		})
	})

	it('gate --fast whose steps count no test -> no tests.json', async () => {
		const lot = createStepLot({ fast: [{ name: 'quiet', run: 'true' }] })

		await runGate({ cwd: lot.worktree, argv: [] })

		expect(testsRecordOf(lot.lotFolder)).toBeUndefined()
	})

	it("gate --fast in the lot's review throwaway, a step counting tests -> no tests.json: only the lot's own worktree writes it", async () => {
		const lot = createStepLot({ fast: [COUNTED_STEP] })
		const throwaway = addWorktreeFolder({
			workspace: lot.workspace,
			folderName: `${STEP_LOT}-round-1`,
		})

		await runGate({ cwd: throwaway, argv: [] })

		expect(testsRecordOf(lot.lotFolder)).toBeUndefined()
	})

	it('a tests.json that cannot be written -> the run stands: the ! line before the verdict', async () => {
		const lot = createStepLot({ fast: [COUNTED_STEP] })
		mkdirSync(join(lot.lotFolder, STORE_FILES.tests, 'blocked'), { recursive: true })

		const result = await runGate({ cwd: lot.worktree, argv: [] })

		expect({
			exitCode: result.exitCode,
			lines: result.output.trimEnd().split('\n').slice(-2),
		}).toEqual({
			exitCode: 0,
			lines: [expect.stringMatching(/^! tests\.json not written: /), 'gate --fast: green'],
		})
	})

	it('a tests.json that cannot be written, gate --json -> the ! line in its warnings', async () => {
		const lot = createStepLot({ fast: [COUNTED_STEP] })
		mkdirSync(join(lot.lotFolder, STORE_FILES.tests, 'blocked'), { recursive: true })

		const result = await runGate({ cwd: lot.worktree, argv: ['--json'] })

		expect({
			exitCode: result.exitCode,
			warnings: (JSON.parse(result.output) as { warnings?: unknown }).warnings,
		}).toEqual({
			exitCode: 0,
			warnings: [expect.stringMatching(/^! tests\.json not written: /)],
		})
	})
})

/** A step that prints a failed case of `src/a.test.ts` and exits 1: no vitest, so no serial rerun. */
const FAILING_STEP = {
	name: 'unit',
	run: "printf ' \\342\\235\\257 src/a.test.ts (1 test | 1 failed)\\n FAIL  src/a.test.ts > g > c\\n Test Files  1 failed (1)\\n      Tests  1 failed (1)\\n'; exit 1",
	counts: 'tests' as const,
}

describe(
	'gate - the ledger of tests.json (D2, wired)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('gate --fast whose test step fails a case -> the gate part holds its named entry, its case and the run', async () => {
			const lot = createStepLot({ fast: [FAILING_STEP] })

			await runGate({ cwd: lot.worktree, argv: [] })

			expect(
				(testsRecordOf(lot.lotFolder) as { gate?: { failures?: unknown } })?.gate?.failures,
			).toEqual([
				{
					key: 'src/a.test.ts',
					cases: ['src/a.test.ts > g > c'],
					mode: 'fast',
					head: expect.stringMatching(/^[0-9a-f]{40}$/),
					stateHash: expect.stringMatching(/^[0-9a-f]{64}$/),
					at: expect.any(String),
				},
			])
		})

		it('an unknown failure on record, then gate --release whose test step passes the whole suite -> no failure left', async () => {
			const lot = createStepLot({ release: [COUNTED_STEP] })
			writeFileSync(
				join(lot.lotFolder, STORE_FILES.tests),
				JSON.stringify({
					schema: 1,
					gate: {
						mode: null,
						at: '2026-01-01T00:00:00.000Z',
						head: 'a'.repeat(40),
						stateHash: '9'.repeat(64),
						failures: [
							{ key: null, unknown: 'tests.json did not read', at: '2026-01-01T00:00:00.000Z' },
						],
					},
				}),
			)

			await runGate({ cwd: lot.worktree, argv: ['--release'] })

			expect(
				(testsRecordOf(lot.lotFolder) as { gate?: { failures?: unknown } })?.gate?.failures,
			).toEqual([])
		})
	},
)
