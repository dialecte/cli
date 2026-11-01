/**
 * A running hook's output as the lot shows it: on a terminal, under the lot's spinner, the current step
 * with the time since its header and the warning and error lines seen so far (a script run in parallel by
 * its parent shows as the parent); off a terminal, behind the hook prefix, a `▶ <step>` line per step and
 * each warning or error line as it comes; only those lines hold off the lot's running line. Each such line is
 * labelled by its step (`[lint:check] <line>`); a test step shows its failures only. On a terminal a line its
 * step printed already is not a new line: its count (`(×3)`) shows on the first one, updated in place. Off a
 * terminal each line is written as it is read; its identical repeats right after it are counted, and once
 * that run of repeats ends (another flagged line, the next step, the hook's end) the line is written again
 * with the run's count. Every other line goes to the full log only.
 */
import { formatDuration } from '../progress/format-duration.ts'
import { LIVE_TAIL_LINES } from '../progress/progress.constants.ts'
import { HOOK_OUTPUT_PREFIX } from './handover.constants.ts'
import { createHookStepReader, withRepeatCount } from './hook-output.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { RunningStep } from '../progress/step-progress.types.ts'
import type { WriteLine } from './handover.types.ts'
import type { HookLiveView, RepeatedLine } from './hook-output.types.ts'

export function createHookLiveView(params: {
	running: RunningStep
	tty: boolean
	write: WriteLine
	clock: Clock
}): HookLiveView {
	const { running, tty, write, clock } = params
	/** The distinct flagged lines on a terminal, in the order first printed, each with its count. */
	const flagged: RepeatedLine[] = []
	/** On a terminal: how many times each flagged line was printed so far. */
	const counts = new Map<string, number>()
	/** Off a terminal: the flagged line written last and how many times it was printed in a row since. */
	let run: RepeatedLine | undefined
	let current: { name: string; startedAt: number } | undefined
	/** The live region under the spinner, its step's time read at each redraw. */
	function render(now: number): string[] {
		return [
			...(current
				? [`${HOOK_OUTPUT_PREFIX}▶ ${current.name} ${formatDuration(now - current.startedAt)}`]
				: []),
			...flagged
				.slice(-LIVE_TAIL_LINES)
				.map((line) => `${HOOK_OUTPUT_PREFIX}${withRepeatCount(line)}`),
		]
	}
	function writeLine(line: string): void {
		write(`${HOOK_OUTPUT_PREFIX}${line}`)
		running.wrote()
	}
	/** Off a terminal, the run of repeats ends: a run of two or more is written again with its count. */
	function endRun(): void {
		if (run && run.count > 1) writeLine(withRepeatCount(run))
		run = undefined
	}
	const reader = createHookStepReader({
		onStep: function stepStarted(step) {
			if (!tty) {
				endRun()
				writeLine(`▶ ${step.name}`)
				return
			}
			current = { name: step.name, startedAt: clock.now() }
			running.show(render)
		},
		onFlagged: function lineFlagged(entry) {
			if (!tty) {
				if (run?.text === entry.label) {
					run.count += 1
					return
				}
				endRun()
				writeLine(entry.label)
				run = { text: entry.label, count: 1 }
				return
			}
			const count = (counts.get(entry.label) ?? 0) + 1
			counts.set(entry.label, count)
			const shown = flagged.find((line) => line.text === entry.label)
			if (shown) shown.count = count
			else flagged.push({ text: entry.label, count })
			running.show(render)
		},
	})
	return {
		read(line) {
			reader.read(line)
		},
		end() {
			endRun()
		},
	}
}
