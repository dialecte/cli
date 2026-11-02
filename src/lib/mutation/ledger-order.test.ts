import { PACKAGE_NAME, SCOPE_FILE } from '../../../test/mutation-package.constants.ts'
import { ledgerKeyOf, storedRuns, survivorOf } from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { readLedger, updateLedger } from './ledger.ts'
import { finishRun, startRun } from './run-store.ts'

import { describe, expect, it } from 'vitest'

import type { RunEntry } from './mutation.types.ts'

const TREE = 'a'.repeat(40)
const LOT = 'lot-a'
const COUNTS = { killed: 0, survived: 2, timedOut: 0, noCoverage: 0 }

/** A run of LOT over the scope file, started and reported at the given times, reporting these survivors. */
function reported(params: {
	root: string
	keys: string[]
	startedAt: string
	finishedAt: string
}): RunEntry {
	const { root, keys, startedAt, finishedAt } = params
	const { runId } = startRun({
		root,
		pid: process.pid,
		lot: LOT,
		tree: TREE,
		mode: 'changed',
		targets: [SCOPE_FILE],
		now: new Date(startedAt),
	})
	return finishRun({
		root,
		runId,
		counts: COUNTS,
		survivors: keys.map((key) => survivorOf({ key })),
		detected: [],
		tested: keys,
		now: new Date(finishedAt),
	})
}

/**
 * Two runs of one lot reported before either took its survivors into the ledger: A (earlier) reports X, B (later)
 * reports X and Y.
 */
function twoReportedRuns(): { root: string; early: RunEntry; late: RunEntry } {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
	})
	const early = reported({
		root,
		keys: ['x'],
		startedAt: '2026-11-02T10:00:00.000Z',
		finishedAt: '2026-11-02T10:05:00.000Z',
	})
	const late = reported({
		root,
		keys: ['x', 'y'],
		startedAt: '2026-11-02T10:01:00.000Z',
		finishedAt: '2026-11-02T10:10:00.000Z',
	})
	expect(storedRuns(root).map(({ state }) => state)).toEqual(['reported', 'reported'])
	return { root, early, late }
}

describe('two reported runs taken into the ledger', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the later run’s update first, then the earlier one’s → Y, reported only by the later run, stays new', () => {
		const { root, early, late } = twoReportedRuns()

		expect(updateLedger({ root, run: late, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()
		expect(updateLedger({ root, run: early, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()

		expect(readLedger({ root })).toEqual({
			[ledgerKeyOf({ key: 'x' })]: expect.objectContaining({ state: 'new' }),
			[ledgerKeyOf({ key: 'y' })]: expect.objectContaining({ state: 'new' }),
		})
	})

	it('the earlier run’s update first, then the later one’s, then the earlier one’s again (a retried update) → Y stays new: an applied run is never applied again', () => {
		const { root, early, late } = twoReportedRuns()

		expect(updateLedger({ root, run: early, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()
		expect(updateLedger({ root, run: late, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()
		expect(updateLedger({ root, run: early, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()

		expect(readLedger({ root })).toEqual({
			[ledgerKeyOf({ key: 'x' })]: expect.objectContaining({ state: 'new' }),
			[ledgerKeyOf({ key: 'y' })]: expect.objectContaining({ state: 'new' }),
		})
	})
})
