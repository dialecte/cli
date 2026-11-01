/** A hook's output read by the lot's live view, as `handover run` shows it, through a step that keeps what it is given. */
import { createHookLiveView } from '../src/lib/handover/hook-live-view.ts'
import { createFakeClock } from './fake-clock.ts'

import type { LiveLines, RunningStep } from '../src/lib/progress/step-progress.types.ts'

/**
 * The live view reads each line, then hears the hook's end: the lines it wrote (off a terminal), what it
 * had written once each line was read (before the end), and each live region it showed (on a terminal),
 * rendered at the clock's time it was shown (the clock stays at 0).
 */
export function runHookLiveView(params: { lines: readonly string[]; tty: boolean }): {
	written: string[]
	writtenAfterEachRead: string[][]
	regions: string[][]
} {
	const clock = createFakeClock()
	const written: string[] = []
	const regions: string[][] = []
	const running: RunningStep = {
		finish() {
			return undefined
		},
		show(lines: LiveLines) {
			regions.push(typeof lines === 'function' ? lines(clock.now()) : [...lines])
		},
		touch() {
			return undefined
		},
		wrote() {
			return undefined
		},
	}
	const view = createHookLiveView({
		running,
		tty: params.tty,
		write: function keep(line) {
			written.push(line)
		},
		clock,
	})
	const writtenAfterEachRead: string[][] = []
	for (const line of params.lines) {
		view.read(line)
		writtenAfterEachRead.push([...written])
	}
	view.end()
	return { written, writtenAfterEachRead, regions }
}
