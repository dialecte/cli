/** Where the stepped clock pair starts: the wall clock (milliseconds) and the monotonic one (nanoseconds). */
export const WALL_ORIGIN_MS = 1_700_000_000_000
export const MONOTONIC_ORIGIN_NS = 5_000_000_000n

/** Nanoseconds in a millisecond. */
export const NANOSECONDS_PER_MILLISECOND = 1_000_000n

/**
 * A pair whose wall clock runs five minutes between two readings while the monotonic one runs one second: each
 * interval between two readings holds a gap of 299 000 ms, whatever the number of readings a run takes.
 */
export const SLEPT_PAIR = { wallStepMs: 300_000, monotonicStepMs: 1_000 }

/** A pair whose two clocks run 90 s (over the 60 s threshold) between two readings, together: no gap. */
export const ALIGNED_PAIR = { wallStepMs: 90_000, monotonicStepMs: 90_000 }

/** The gap of one interval of `SLEPT_PAIR`. */
export const SLEPT_INTERVAL_MS = 299_000
