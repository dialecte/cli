/** A clock pair that moves a fixed step at every reading: the gap between its two clocks is known whatever reads it. */
import {
	MONOTONIC_ORIGIN_NS,
	NANOSECONDS_PER_MILLISECOND,
	WALL_ORIGIN_MS,
} from './run-clocks.constants.ts'

import type { RunClocks } from '../src/lib/progress/slept.types.ts'

export function createSteppedRunClocks(params: {
	wallStepMs: number
	monotonicStepMs: number
}): RunClocks {
	let wall = WALL_ORIGIN_MS
	let monotonic = MONOTONIC_ORIGIN_NS
	return {
		wallNow() {
			const reading = wall
			wall += params.wallStepMs
			return reading
		},
		monotonicNow() {
			const reading = monotonic
			monotonic += BigInt(params.monotonicStepMs) * NANOSECONDS_PER_MILLISECOND
			return reading
		},
	}
}
