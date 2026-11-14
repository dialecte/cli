/**
 * `handover write --out <lot folder>` records the class derived at the write (33L1 section 5, case 31): a `derived`
 * line `from: "handover-write"` in the lot folder's `risk.jsonl`, so the card reads it after the worktree is gone.
 * One real lot, real git.
 */
import { LOT_HANDOVER_NOW } from '../../test/lot-handover-workspace.constants.ts'
import {
	isolateStateFolder,
	startRealLot,
	writeLotHandover,
} from '../../test/lot-handover-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readRiskRecords } from '../lib/risk/risk-records.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('handover write - the derived line', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a real lot written into its folder -> the last derived line is from handover-write, made at the write', () => {
		isolateStateFolder()
		const lot = startRealLot()
		const before = readRiskRecords({ folder: lot.lotFolder }).derived

		writeLotHandover(lot)

		const derived = readRiskRecords({ folder: lot.lotFolder }).derived
		expect({
			added: derived.length - before.length,
			last: { from: derived.at(-1)?.from, at: derived.at(-1)?.at },
		}).toEqual({
			added: 1,
			last: { from: 'handover-write', at: LOT_HANDOVER_NOW.toISOString() },
		})
	})
})
