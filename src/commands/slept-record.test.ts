/**
 * A run that spans a sleep keeps `sleptMs` on its record: `gate --full` and `gate --release` (the gate record),
 * `handover run` (the run record of its folder); a run whose two clocks agree keeps nothing. The clock pair is
 * injected: it moves by a fixed step at every reading.
 */
import { readRecordFile } from '../../test/gate-records.ts'
import { editedPackage, writeProfileHandover } from '../../test/handover-profile.ts'
import { ALIGNED_PAIR, SLEPT_INTERVAL_MS, SLEPT_PAIR } from '../../test/run-clocks.constants.ts'
import { createSteppedRunClocks } from '../../test/run-clocks.ts'
import { RELEASE_RECORD_FILE } from '../../test/scoped-gate-package.constants.ts'
import {
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import { createGatePackage, runFolder } from '../../test/scratch-checks.ts'
import { PASSING_STEP } from '../../test/step4-cases.constants.ts'
import { readHandoverRunRecord } from '../lib/handover/handover-run-record.ts'
import { runGate } from './gate.ts'

import { describe, expect, it, vi } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

/** Whether a `sleptMs` is a positive whole number of the slept pair's intervals: `[positive, whole]`. */
function intervalsOf(sleptMs: number | undefined): [boolean, boolean] {
	return [(sleptMs ?? 0) > 0, (sleptMs ?? 1) % SLEPT_INTERVAL_MS === 0]
}

describe('sleptMs on a gate record', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('gate --full over a sleep → the full record keeps sleptMs', async () => {
		const root = createGatePackage({ full: [PASSING_STEP] })

		await runGate({ cwd: root, argv: ['--full'], runClocks: createSteppedRunClocks(SLEPT_PAIR) })

		expect(
			intervalsOf(readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })?.sleptMs),
		).toEqual([true, true])
	})

	it('gate --release over a sleep → the release record keeps sleptMs', async () => {
		const root = createGatePackage({ full: [PASSING_STEP] })

		await runGate({
			cwd: root,
			argv: ['--release'],
			runClocks: createSteppedRunClocks(SLEPT_PAIR),
		})

		expect(
			intervalsOf(readRecordFile<GateRecord>({ root, name: RELEASE_RECORD_FILE })?.sleptMs),
		).toEqual([true, true])
	})

	it('gate --full with the two clocks agreeing → the record holds no sleptMs', async () => {
		const root = createGatePackage({ full: [PASSING_STEP] })
		const clocks = createSteppedRunClocks(ALIGNED_PAIR)
		const wallNow = vi.fn(clocks.wallNow)
		const monotonicNow = vi.fn(clocks.monotonicNow)

		await runGate({ cwd: root, argv: ['--full'], runClocks: { wallNow, monotonicNow } })

		const record = readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })
		// the run read both clocks at its start and at its end, and found no gap
		expect([wallNow, monotonicNow].map((clock) => clock.mock.calls.length >= 2)).toEqual([
			true,
			true,
		])
		expect(record).toBeDefined()
		expect(record).not.toHaveProperty('sleptMs')
	})
})

describe('sleptMs on a hand-over run record', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('handover run over a sleep → the folder’s run record keeps sleptMs', async () => {
		const out = writeProfileHandover({ root: editedPackage({ profile: null }) })

		await runFolder({ out, runClocks: createSteppedRunClocks(SLEPT_PAIR) })

		expect(intervalsOf(readHandoverRunRecord(out)?.sleptMs)).toEqual([true, true])
	})

	it('handover run --rehearse over a sleep → the folder’s run record keeps sleptMs', async () => {
		const out = writeProfileHandover({ root: editedPackage({ profile: null }) })

		await runFolder({
			out,
			argv: ['--rehearse'],
			runClocks: createSteppedRunClocks(SLEPT_PAIR),
		})

		expect(intervalsOf(readHandoverRunRecord(out)?.sleptMs)).toEqual([true, true])
	})

	it('handover run with the two clocks agreeing → no sleptMs on its record', async () => {
		const out = writeProfileHandover({ root: editedPackage({ profile: null }) })

		await runFolder({ out, runClocks: createSteppedRunClocks(ALIGNED_PAIR) })

		expect(readHandoverRunRecord(out)?.sleptMs).toBeUndefined()
	})
})
