/** How long the machine slept during a run, read from the gap between its wall and monotonic durations. */
import { NANOSECONDS_PER_MILLISECOND, SLEPT_THRESHOLD_MS } from './slept.constants.ts'

import type { RunClocks } from './slept.types.ts'

/**
 * The milliseconds a run spanned a sleep: the wall duration minus the monotonic one, when the gap is over 60 s;
 * undefined for a gap of 60 s or less (nothing to say).
 */
export function sleptMsOf(params: {
	/** Wall clock at the start and the end, in milliseconds. */
	wallStart: number
	wallEnd: number
	/** Monotonic clock at the start and the end, in nanoseconds. */
	monotonicStart: bigint
	monotonicEnd: bigint
}): number | undefined {
	const wallMs = params.wallEnd - params.wallStart
	const monotonicMs = Number(
		(params.monotonicEnd - params.monotonicStart) / NANOSECONDS_PER_MILLISECOND,
	)
	const gap = wallMs - monotonicMs
	return gap > SLEPT_THRESHOLD_MS ? gap : undefined
}

/** The process's own clock pair: `Date.now()` and `process.hrtime.bigint()`. */
export function createSystemRunClocks(): RunClocks {
	return {
		wallNow() {
			return Date.now()
		},
		monotonicNow() {
			return process.hrtime.bigint()
		},
	}
}

/**
 * Reads both clocks now (a run's start); the function it answers reads them again (the run's end) and answers how
 * long the machine slept in between (`sleptMsOf`), undefined when it did not.
 */
export function startRunClocks(clocks: RunClocks): () => number | undefined {
	const wallStart = clocks.wallNow()
	const monotonicStart = clocks.monotonicNow()
	return function sleptSinceStart() {
		const wallEnd = clocks.wallNow()
		const monotonicEnd = clocks.monotonicNow()
		return sleptMsOf({ wallStart, wallEnd, monotonicStart, monotonicEnd })
	}
}
