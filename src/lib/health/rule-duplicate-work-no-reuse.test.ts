/**
 * A run given `--no-reuse` is a deliberate re-run, never duplicate work: its `step.end` carries `noReuse: true`. The
 * rule skips a store pair whose matched run carries it and an identical-key re-run whose end carries it. In-memory,
 * no git process; fixture files relied on: none (every record and event is a whole document built by
 * test/health.ts helpers).
 */
import {
	GREEN_AT,
	HEALTH_LOT,
	LONG_RUN_MS,
	RERUN_AT,
	SAME_KEY_TEXT,
	STATE_ONE,
	WINDOW,
} from '../../../test/health.constants.ts'
import {
	keyOf,
	recordOf,
	reRunSummary,
	runBeforeRecord,
	summarizeFindings,
	writeHealthCommon,
} from '../../../test/health.ts'
import { readHealthRepository } from './read-health-context.ts'
import { findDuplicateWork } from './rule-duplicate-work.ts'

import { describe, expect, it } from 'vitest'

import type { RunSpec } from '../../../test/health.types.ts'
import type { FindingSummary } from '../../../test/health.types.ts'
import type { LotEvent } from '../events/event.types.ts'
import type { GateRecordMode } from '../gate-records/gate-records.types.ts'

type NoReuseRow = {
	name: string
	mode: GateRecordMode
	step: string
	noReuse: boolean
	expected: FindingSummary[]
}

/** The events of one run, its end carrying `noReuse: true` when asked. */
function runEvents(params: {
	run: RunSpec
	name: string
	recordAt: string
	noReuse: boolean
}): LotEvent[] {
	const events = runBeforeRecord({
		...params.run,
		lot: HEALTH_LOT,
		run: params.name,
		recordAt: params.recordAt,
	})
	if (!params.noReuse) return events
	return events.map((event) => (event.kind === 'step.end' ? { ...event, noReuse: true } : event))
}

const storeRows: NoReuseRow[] = [
	{
		name: 'a green full record, then a full record whose run (gate-full, 10 min) carries noReuse → no finding',
		mode: 'full',
		step: 'gate-full',
		noReuse: true,
		expected: [],
	},
	{
		name: 'the same without noReuse → red, the reuse missed it (the old rule holds)',
		mode: 'full',
		step: 'gate-full',
		noReuse: false,
		expected: [reRunSummary({ rerunMode: 'full', greenMode: 'full', last: SAME_KEY_TEXT })],
	},
	{
		name: 'the same on contrib, the run carrying noReuse → no finding',
		mode: 'contrib',
		step: 'contrib',
		noReuse: true,
		expected: [],
	},
]

describe('findDuplicateWork, a run given --no-reuse', () => {
	for (const row of storeRows) {
		it(row.name, () => {
			const common = writeHealthCommon({
				records: [
					recordOf({ mode: row.mode, at: GREEN_AT }),
					recordOf({ mode: row.mode, at: RERUN_AT }),
				],
				lots: [
					{
						name: HEALTH_LOT,
						events: runEvents({
							run: { step: row.step, durationMs: LONG_RUN_MS },
							name: 'again',
							recordAt: RERUN_AT,
							noReuse: row.noReuse,
						}),
					},
				],
			})

			expect(
				summarizeFindings(
					findDuplicateWork({ repository: readHealthRepository({ common }), window: WINDOW }),
				),
			).toEqual(row.expected)
		})
	}

	it('two gate-full ends of one state hash and equal keys, the second carrying noReuse → no finding', () => {
		const run: RunSpec = {
			step: 'gate-full',
			durationMs: LONG_RUN_MS,
			stateHash: STATE_ONE,
			key: keyOf(),
			reuse: 'none',
		}
		const common = writeHealthCommon({
			lots: [
				{
					name: HEALTH_LOT,
					events: [
						...runEvents({
							run: { ...run, durationMs: 5_000, endedBeforeMs: 0 },
							name: 'first',
							recordAt: GREEN_AT,
							noReuse: false,
						}),
						...runEvents({ run, name: 'second', recordAt: RERUN_AT, noReuse: true }),
					],
				},
			],
		})

		expect(
			summarizeFindings(
				findDuplicateWork({ repository: readHealthRepository({ common }), window: WINDOW }),
			),
		).toEqual([])
	})
})
