/** A clock the test moves by hand: timers fire and sleeps return only when it says so. */
import type { FakeClock } from './fake-clock.types.ts'

export function createFakeClock(): FakeClock {
	let now = 0
	let nextId = 0
	const timers = new Map<number, { at: number; callback: () => void }>()
	function advance(milliseconds: number): void {
		const target = now + milliseconds
		for (;;) {
			const due = [...timers.entries()]
				.filter((entry) => entry[1].at <= target)
				.sort((left, right) => left[1].at - right[1].at)[0]
			if (!due) break
			timers.delete(due[0])
			now = due[1].at
			due[1].callback()
		}
		now = target
	}
	const clock: FakeClock = {
		now() {
			return now
		},
		setTimeout(params) {
			nextId += 1
			timers.set(nextId, { at: now + params.milliseconds, callback: params.callback })
			return nextId
		},
		clearTimeout(timer) {
			timers.delete(timer as number)
		},
		sleep(milliseconds) {
			advance(milliseconds)
			clock.onSleep?.(now)
		},
		advance,
		pending() {
			return timers.size
		},
		async whenPending(count) {
			// bounded: code that never arms (not written yet) fails on its own assertions, not by hanging
			const giveUpAt = Date.now() + 5_000
			while (timers.size < count && Date.now() < giveUpAt)
				await new Promise((resolve) => setImmediate(resolve))
		},
	}
	return clock
}
