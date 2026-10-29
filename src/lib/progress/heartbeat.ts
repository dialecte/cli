/**
 * A line every `every` milliseconds of silence: each `touch` (the command printed something) starts the
 * silence again; each beat reports the time since `startedAt`.
 */
import type { Clock, ClockTimer, Heartbeat, HeartbeatBeat } from './clock.types.ts'

export function startHeartbeat(params: {
	clock: Clock
	every: number
	startedAt: number
	onBeat: (beat: HeartbeatBeat) => void
}): Heartbeat {
	const { clock, every } = params
	let timer: ClockTimer | undefined
	let silentBeats = 0
	function schedule(): void {
		timer = clock.setTimeout({
			callback: function beat() {
				silentBeats += 1
				params.onBeat({ elapsed: clock.now() - params.startedAt, silentBeats })
				schedule()
			},
			milliseconds: every,
		})
	}
	schedule()
	return {
		touch() {
			if (timer === undefined) return
			silentBeats = 0
			clock.clearTimeout(timer)
			schedule()
		},
		stop() {
			if (timer !== undefined) clock.clearTimeout(timer)
			timer = undefined
		},
	}
}
