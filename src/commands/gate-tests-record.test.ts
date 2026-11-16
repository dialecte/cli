/**
 * The gate part of a lot's `tests.json` (33CI CI2a): a gate run in the lot's worktree writes the counts of its newest
 * run that counted tests, and the tree it ran on; a run that counted none writes no part.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
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
			},
		})
	})

	it('gate --fast whose steps count no test -> no tests.json', async () => {
		const lot = createStepLot({ fast: [{ name: 'quiet', run: 'true' }] })

		await runGate({ cwd: lot.worktree, argv: [] })

		expect(testsRecordOf(lot.lotFolder)).toBeUndefined()
	})
})
