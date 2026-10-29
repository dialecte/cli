import type { Clock } from '../src/lib/progress/clock.types.ts'

/** A clock the test moves by hand. */
export type FakeClock = Clock & {
	/** Moves the time forward, firing every timer due on the way, in order. */
	advance(milliseconds: number): void
	/** Called after each `sleep`, with the time it reached. */
	onSleep?: (now: number) => void
}
