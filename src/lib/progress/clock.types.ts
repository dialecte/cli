/** Time as the long-running commands see it: the system's in production, a fake one in the tests. */
export type Clock = {
	/** Milliseconds since an arbitrary origin. */
	now(): number
	setTimeout(params: { callback: () => void; milliseconds: number }): ClockTimer
	clearTimeout(timer: ClockTimer): void
	/** Blocks the caller (the synchronous waits of a retry). */
	sleep(milliseconds: number): void
}

/** What `setTimeout` answered, handed back to `clearTimeout`. */
export type ClockTimer = unknown

/** Prints a heartbeat while a command is silent; `touch` on everything it prints. */
export type Heartbeat = {
	touch(): void
	stop(): void
}

/** One heartbeat: the time since the start, and how many beats in a row came without a line. */
export type HeartbeatBeat = { elapsed: number; silentBeats: number }
