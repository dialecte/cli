import { PACKAGE_NAME, SCOPE_FILE } from '../../../test/mutation-package.constants.ts'
import { ledgerKeyOf, survivorOf } from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { readLedger, updateLedger } from './ledger.ts'
import { finishRun, startRun } from './run-store.ts'

import { describe, expect, it } from 'vitest'

const TREE_OLD = '1'.repeat(40)
const TREE_NEW = '2'.repeat(40)
const COUNTS = { killed: 1, survived: 1, timedOut: 0, noCoverage: 0 }

describe(
	'two runs of one lot that overlap in time',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('A starts first on the older tree and finishes last having killed Y; B starts later and reports Y in between → Y stays new', () => {
			const root = createScratchRepository({
				'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
			})
			const early = startRun({
				root,
				pid: process.pid,
				lot: 'lot-a',
				tree: TREE_OLD,
				mode: 'changed',
				targets: [SCOPE_FILE],
				now: new Date('2026-11-02T10:00:00.000Z'),
			})
			const late = startRun({
				root,
				pid: process.pid,
				lot: 'lot-a',
				tree: TREE_NEW,
				mode: 'changed',
				targets: [SCOPE_FILE],
				now: new Date('2026-11-02T10:01:00.000Z'),
			})
			const reportedLate = finishRun({
				root,
				runId: late.runId,
				counts: COUNTS,
				survivors: [survivorOf({ key: 'y' })],
				detected: [],
				tested: ['y'],
				now: new Date('2026-11-02T10:05:00.000Z'),
			})
			expect(
				updateLedger({ root, run: reportedLate, records: {}, targets: [SCOPE_FILE] }),
			).toBeUndefined()
			const reportedEarly = finishRun({
				root,
				runId: early.runId,
				counts: COUNTS,
				survivors: [],
				detected: ['y'],
				tested: ['y'],
				now: new Date('2026-11-02T10:10:00.000Z'),
			})

			expect(
				updateLedger({ root, run: reportedEarly, records: {}, targets: [SCOPE_FILE] }),
			).toBeUndefined()

			expect(readLedger({ root })).toEqual({
				[ledgerKeyOf({ key: 'y' })]: expect.objectContaining({ state: 'new' }),
			})
		})
	},
)
