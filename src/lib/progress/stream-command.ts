/**
 * Runs a command and prints each line it writes (standard output and error) as it comes, behind a
 * prefix; while it stays silent, a heartbeat line every `every` milliseconds says how long it has run.
 * Nothing is read from a terminal: its input is the given text, then end-of-file. It runs through
 * `runChild`: a command silent with no CPU gained by its processes for `stallAfter` is stopped as stalled.
 */
import { formatDuration } from './format-duration.ts'
import { startHeartbeat } from './heartbeat.ts'
import {
	HEARTBEAT_HINT_AFTER_BEATS,
	LIVE_TAIL_LINES,
	SILENT_HOOK_HINT,
} from './progress.constants.ts'
import { runChild } from './run-child.ts'

import type { Clock } from './clock.types.ts'
import type { StreamedCommand, Watchdog } from './run-child.types.ts'
import type { RunningStep } from './step-progress.types.ts'

export async function streamCommand(params: {
	command: string
	args: string[]
	cwd: string
	input?: string
	/** Put before every line the command prints. */
	prefix: string
	/** The heartbeat line, given the time the command has run: `… hook running 2 m 10 s`. */
	heartbeatLabel: string
	write: (line: string) => void
	clock: Clock
	every: number
	/**
	 * Says the pid of its process group (it always runs in one of its own): the caller can then stop it
	 * and every process it started (a hook's test runner) on an interrupt.
	 */
	onProcessGroup?: (pid: number) => void
	/** Stops it when it prints nothing and its tree gains no CPU for `stallAfter`; the result then says `stalled`. */
	watchdog?: Watchdog
	/**
	 * The step the command runs in: its progress replaces the heartbeat; on a terminal the command's last
	 * lines show live under its spinner instead of being written.
	 */
	step?: { running: RunningStep; tty: boolean }
	/** Each piece of text the command prints, as it comes (a log kept while it runs). */
	onText?: (text: string) => void
}): Promise<StreamedCommand> {
	const { clock, write, step } = params
	let printed = false
	const tail: string[] = []
	function print(line: string): void {
		if (!step?.tty) {
			write(`${params.prefix}${line}`)
			return
		}
		tail.push(`${params.prefix}${line}`)
		if (tail.length > LIVE_TAIL_LINES) tail.shift()
		step.running.show(tail)
	}
	// a step has its own progress (running lines, or a spinner)
	const heartbeat = step
		? undefined
		: startHeartbeat({
				clock,
				every: params.every,
				startedAt: clock.now(),
				onBeat: function beat(beat) {
					const silence = printed
						? `silent for ${formatDuration(beat.silentBeats * params.every)}`
						: 'silent since it started'
					const hint =
						beat.silentBeats === HEARTBEAT_HINT_AFTER_BEATS
							? ` - ${silence}: ${SILENT_HOOK_HINT}`
							: ''
					write(`${params.heartbeatLabel} ${formatDuration(beat.elapsed)}${hint}`)
				},
			})
	try {
		return await runChild({
			command: params.command,
			args: params.args,
			cwd: params.cwd,
			input: params.input,
			environment: { FORCE_COLOR: '0' },
			onLine: print,
			onOutput: function heard(text) {
				params.onText?.(text)
				printed = true
				heartbeat?.touch()
				step?.running.touch()
			},
			onProcessGroup: params.onProcessGroup,
			clock,
			watchdog: params.watchdog,
		})
	} finally {
		heartbeat?.stop()
	}
}
