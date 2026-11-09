/** `reusedResults`: the steps of a reused record as results, keeping what the record said of each. */
import { reusedResults } from './record-reuse.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord } from './gate-records.types.ts'

const FLAKY_FILES = ['src/a.test.ts', 'src/b.test.ts']

const RECORD: GateRecord = {
	mode: 'full',
	at: '2026-11-09T10:00:00.000Z',
	head: 'a'.repeat(40),
	stateHash: 'b'.repeat(64),
	steps: [
		{
			name: 'tests',
			status: 'passed',
			counts: { tests: { passed: 5, failed: 0, skipped: 0, total: 5 } },
			note: 'flaky in parallel',
			failing: FLAKY_FILES,
		},
		{ name: 'check', status: 'passed', counts: {} },
	],
}

describe('reusedResults', () => {
	it('a recorded step with failing files → its result keeps them; a step without any has none', () => {
		expect(
			reusedResults({ record: RECORD, steps: [{ name: 'tests', run: 'true' }] }).map((result) => ({
				name: result.step.name,
				failing: result.failing,
			})),
		).toEqual([
			{ name: 'tests', failing: FLAKY_FILES },
			{ name: 'check', failing: undefined },
		])
	})
})
