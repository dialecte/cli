/**
 * A running step looks running. Off a terminal: a start line `▶ <step>` before the work, then a
 * line every `every` milliseconds in which the step wrote no line (`  … <step> running 1 m 0 s`),
 * then its result line. On a terminal: one spinner line `⠋ <step> - <what runs> <elapsed>` redrawn
 * every `tickEvery` milliseconds, with what the step shows under it (a hook's current step and its
 * warnings, rendered again at each redraw when they carry a time), replaced by the step's result
 * line. The result line is never the last visible line while work continues.
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
import type { LiveLines, LiveOutput, RunningStep, StepProgress } from './step-progress.types.ts'

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
			let shown: LiveLines = []
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
					...(typeof shown === 'function' ? shown(now) : shown),
				])
			}
			function tick(): void {
				frame += 1
				draw()
				timer = clock.setTimeout({ callback: tick, milliseconds: tickEvery })
			}
			let hinted = false
			function beat(): void {
				const now = clock.now()
				const silence = now - heardAt
				// once per silence: a silent hook is often waiting for input or watching files
				const hint =
					step.hintWhenSilent && !hinted && silence >= every * HEARTBEAT_HINT_AFTER_BEATS
						? ` - silent for ${formatDuration(silence)}: ${SILENT_HOOK_HINT}`
						: ''
				if (hint) hinted = true
				live.writeLine(`  … ${step.name} running ${formatDuration(now - startedAt)}${hint}`)
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
					hinted = false
				},
				wrote() {
					// a line printed is what shows the step running: output heard but filtered out shows
					// nothing
					if (live.tty || timer === undefined) return
					stop()
					timer = clock.setTimeout({ callback: beat, milliseconds: every })
				},
			}
		},
	}
}
