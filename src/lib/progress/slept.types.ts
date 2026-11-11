/**
 * The two clocks a long run measures itself with: the wall clock (`Date.now()`, which runs through a sleep) and the
 * monotonic one (`process.hrtime.bigint()`, which stops while the machine sleeps on macOS and Linux). The tests
 * inject a pair.
 */
export type RunClocks = {
	/** Milliseconds since the epoch. */
	wallNow(): number
	/** Nanoseconds since an arbitrary origin. */
	monotonicNow(): bigint
}
