/** `sleptMsOf`: the gap between the wall and the monotonic durations of a run, kept only over 60 s. */
import {
	MONOTONIC_ORIGIN_NS,
	NANOSECONDS_PER_MILLISECOND,
	WALL_ORIGIN_MS,
} from '../../../test/run-clocks.constants.ts'
import { sleptMsOf } from './slept.ts'

import { describe, expect, it } from 'vitest'

describe('sleptMsOf', () => {
	const ROWS: Record<string, { wallMs: number; monotonicMs: number; slept: number | undefined }> = {
		'the clocks agree → nothing': { wallMs: 120_000, monotonicMs: 120_000, slept: undefined },
		'a gap of 59 999 ms → nothing': { wallMs: 119_999, monotonicMs: 60_000, slept: undefined },
		'a gap of exactly 60 s → nothing': { wallMs: 180_000, monotonicMs: 120_000, slept: undefined },
		'a gap of 60 001 ms → the gap': { wallMs: 180_001, monotonicMs: 120_000, slept: 60_001 },
		'a night: 8 h on the wall, 20 min on the monotonic clock → the 7 h 40 min between': {
			wallMs: 28_800_000,
			monotonicMs: 1_200_000,
			slept: 27_600_000,
		},
		'the monotonic clock longer than the wall clock (the wall clock was set back) → nothing': {
			wallMs: 10_000,
			monotonicMs: 400_000,
			slept: undefined,
		},
		'a run of no time → nothing': { wallMs: 0, monotonicMs: 0, slept: undefined },
	}

	for (const [name, row] of Object.entries(ROWS))
		it(name, () => {
			expect(
				sleptMsOf({
					wallStart: WALL_ORIGIN_MS,
					wallEnd: WALL_ORIGIN_MS + row.wallMs,
					monotonicStart: MONOTONIC_ORIGIN_NS,
					monotonicEnd: MONOTONIC_ORIGIN_NS + BigInt(row.monotonicMs) * NANOSECONDS_PER_MILLISECOND,
				}),
			).toBe(row.slept)
		})
})
