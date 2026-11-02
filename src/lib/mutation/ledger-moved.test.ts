import { PACKAGE_NAME, SCOPE_FILE } from '../../../test/mutation-package.constants.ts'
import { ledgerKeyOf, reportedRun, survivorOf } from '../../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { readLedger, updateLedger } from './ledger.ts'

import { describe, expect, it } from 'vitest'

import type { MutationRecords } from './mutation.types.ts'

const LISTING: MutationRecords = {
	[SCOPE_FILE]: {
		k1: {
			line: 2,
			mutation: 'ConditionalExpression: x === 1 -> true',
			family: 'wording',
			reason: 'no output reads it',
			lineHash: 'h',
		},
	},
}

describe('an item already recorded', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('reported again by a later run → still recorded, movedBy still names the run that recorded it', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: PACKAGE_NAME })}\n`,
		})
		const seen = reportedRun({ root, runId: 'r1', survivors: [survivorOf({ key: 'k1' })] })
		const recording = reportedRun({
			root,
			runId: 'r2',
			startedAt: '2026-11-02T11:00:00.000Z',
			survivors: [survivorOf({ key: 'k1' })],
		})
		const again = reportedRun({
			root,
			runId: 'r3',
			startedAt: '2026-11-02T12:00:00.000Z',
			survivors: [survivorOf({ key: 'k1' })],
		})
		expect(updateLedger({ root, run: seen, records: {}, targets: [SCOPE_FILE] })).toBeUndefined()
		expect(
			updateLedger({ root, run: recording, records: LISTING, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(
			updateLedger({ root, run: again, records: LISTING, targets: [SCOPE_FILE] }),
		).toBeUndefined()

		expect(readLedger({ root })).toEqual({
			[ledgerKeyOf({ key: 'k1' })]: expect.objectContaining({ state: 'recorded', movedBy: 'r2' }),
		})
	})
})
