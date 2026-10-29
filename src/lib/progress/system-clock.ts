/** The clock of the running process. */
import type { Clock } from './clock.types.ts'

export function createSystemClock(): Clock {
	return {
		now() {
			return Date.now()
		},
		setTimeout(params) {
			return setTimeout(params.callback, params.milliseconds)
		},
		clearTimeout(timer) {
			clearTimeout(timer as ReturnType<typeof setTimeout>)
		},
		sleep(milliseconds) {
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
		},
	}
}
