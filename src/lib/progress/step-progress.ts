/**
 * A running step looks running. Off a terminal: a start line `▶ <step>` before the work, then a line every
 * `every` milliseconds of the step's silence (`  … <step> running 1 m 0 s`), then its result line. On a
 * terminal: one spinner line `⠋ <step> - <what runs> <elapsed>` redrawn every `tickEvery` milliseconds,
 * with what the step shows under it (a hook's last lines), replaced by the step's result line. The result
 * line is never the last visible line while work continues.
 */
import { formatDuration } from './format-duration.ts'
import {
	HEARTBEAT_HINT_AFTER_BEATS,
	HEARTBEAT_INTERVAL_MILLISECONDS,
	SILENT_HOOK_HINT,
	SPINNER_FRAMES,
	SPINNER_TICK_MILLISECONDS,
} from './progress.constants.ts'

import type { Clock, ClockTimer } from './clock.types.ts'
import type { LiveOutput, RunningStep, StepProgress } from './step-progress.types.ts'

export function createStepProgress(params: {
	live: LiveOutput
	clock: Clock
	/** Off a terminal: the silence between two running lines. Default 30 s. */
	every?: number
	/** On a terminal: the spinner's redraw interval. Default 100 ms. */
	tickEvery?: number
}): StepProgress {
	const { live, clock } = params
	const every = params.every ?? HEARTBEAT_INTERVAL_MILLISECONDS
	const tickEvery = params.tickEvery ?? SPINNER_TICK_MILLISECONDS
	return {
		start(step): RunningStep {
			const label = step.detail ? `${step.name} - ${step.detail}` : step.name
			const startedAt = clock.now()
			let timer: ClockTimer | undefined
			let frame = 0
			let shown: string[] = []
			let heardAt = startedAt
			function draw(): void {
				const now = clock.now()
				const silence = now - heardAt
				// a silent hook past the hint time is often waiting for input or watching files
				const hint =
					step.hintWhenSilent && silence >= every * HEARTBEAT_HINT_AFTER_BEATS
						? ` - silent for ${formatDuration(silence)}: ${SILENT_HOOK_HINT}`
						: ''
				live.rewriteLines([
					`${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} ${label} ${formatDuration(now - startedAt)}${hint}`,
					...shown,
				])
			}
			function tick(): void {
				frame += 1
				draw()
				timer = clock.setTimeout({ callback: tick, milliseconds: tickEvery })
			}
			let silentBeats = 0
			function beat(): void {
				silentBeats += 1
				// once per silence: a silent hook is often waiting for input or watching files
				const hint =
					step.hintWhenSilent && silentBeats === HEARTBEAT_HINT_AFTER_BEATS
						? ` - silent for ${formatDuration(silentBeats * every)}: ${SILENT_HOOK_HINT}`
						: ''
				live.writeLine(`  … ${step.name} running ${formatDuration(clock.now() - startedAt)}${hint}`)
				timer = clock.setTimeout({ callback: beat, milliseconds: every })
			}
			function stop(): void {
				if (timer !== undefined) clock.clearTimeout(timer)
				timer = undefined
			}
			if (live.tty) {
				draw()
				timer = clock.setTimeout({ callback: tick, milliseconds: tickEvery })
			} else {
				live.writeLine(`▶ ${label}`)
				timer = clock.setTimeout({ callback: beat, milliseconds: every })
			}
			return {
				finish(...lines) {
					stop()
					for (const line of lines) live.writeLine(line)
				},
				show(lines) {
					if (!live.tty || timer === undefined) return
					shown = lines
					draw()
				},
				touch() {
					heardAt = clock.now()
					silentBeats = 0
					if (live.tty || timer === undefined) return
					stop()
					timer = clock.setTimeout({ callback: beat, milliseconds: every })
				},
			}
		},
	}
}
