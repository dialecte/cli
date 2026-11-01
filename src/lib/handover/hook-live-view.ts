/**
 * A running hook's output as the lot shows it: on a terminal, under the lot's spinner, the current step
 * with the time since its header and the warning and error lines seen so far (a script run in parallel by
 * its parent shows as the parent); off a terminal, behind the hook prefix, a `▶ <step>` line per step and
 * each warning or error line as it comes; only those lines hold off the lot's running line. Each such line is
 * labelled by its step (`[lint:check] <line>`); a test step shows its failures only. Every other line goes
 * to the full log only.
 */
import { formatDuration } from '../progress/format-duration.ts'
import { LIVE_TAIL_LINES } from '../progress/progress.constants.ts'
import { HOOK_OUTPUT_PREFIX } from './handover.constants.ts'
import { createHookStepReader } from './hook-output.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { RunningStep } from '../progress/step-progress.types.ts'
import type { WriteLine } from './handover.types.ts'
import type { HookLiveView } from './hook-output.types.ts'

export function createHookLiveView(params: {
	running: RunningStep
	tty: boolean
	write: WriteLine
	clock: Clock
}): HookLiveView {
	const { running, tty, write, clock } = params
	const flagged: string[] = []
	let current: { name: string; startedAt: number } | undefined
	/** The live region under the spinner, its step's time read at each redraw. */
	function render(now: number): string[] {
		return [
			...(current
				? [`${HOOK_OUTPUT_PREFIX}▶ ${current.name} ${formatDuration(now - current.startedAt)}`]
				: []),
			...flagged.slice(-LIVE_TAIL_LINES).map((line) => `${HOOK_OUTPUT_PREFIX}${line}`),
		]
	}
	const reader = createHookStepReader({
		onStep: function stepStarted(step) {
			if (!tty) {
				write(`${HOOK_OUTPUT_PREFIX}▶ ${step.name}`)
				running.wrote()
				return
			}
			current = { name: step.name, startedAt: clock.now() }
			running.show(render)
		},
		onFlagged: function lineFlagged(entry) {
			if (!tty) {
				write(`${HOOK_OUTPUT_PREFIX}${entry.label}`)
				running.wrote()
				return
			}
			flagged.push(entry.label)
			running.show(render)
		},
	})
	return {
		read(line) {
			reader.read(line)
		},
	}
}
