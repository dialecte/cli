/**
 * The cli's own live output over an output stream: a terminal (`isTTY`) redraws its live region in place,
 * reading its width and height at each draw (it can be resized while a step runs); anything else only
 * appends finished lines and has no width. Each region line is reduced to its plain text and fitted to
 * the width by the cells it takes, so it takes one row and the region can be erased exactly; the region
 * never fills the screen (one row is left), and closing leaves an open region on its own line. A finished
 * line passes the relayed boundary: its colours kept, every other control escaped (a line the cli composes
 * from outside values is escaped whole before, by `textOf`).
 */
import { relayedTextOf } from '../print/relayed.ts'
import { ERASE_LINE, ERASE_LINE_ABOVE } from './progress.constants.ts'
import { fitToCells } from './terminal-text.ts'

import type { LiveOutput } from './step-progress.types.ts'
import type { LiveStream } from './stream-live-output.types.ts'

export function createStreamLiveOutput(stream: LiveStream): LiveOutput {
	if (!stream.isTTY)
		return {
			tty: false,
			writeLine(line) {
				stream.write(`${relayedTextOf([line])}\n`)
			},
			rewriteLines() {},
			close() {},
		}
	// the region's rows on screen, the cursor at the end of the last one
	let drawn = 0
	function erase(): void {
		if (drawn === 0) return
		stream.write(`${ERASE_LINE}${ERASE_LINE_ABOVE.repeat(drawn - 1)}`)
		drawn = 0
	}
	return {
		tty: true,
		get columns() {
			return stream.columns
		},
		writeLine(line) {
			erase()
			stream.write(`${relayedTextOf([line])}\n`)
		},
		rewriteLines(lines) {
			erase()
			// the first line (the spinner) and as many of the last ones as the screen leaves room for
			const room = stream.rows ? Math.max(stream.rows - 1, 1) : lines.length
			const shown =
				lines.length > room ? [lines[0], ...lines.slice(lines.length - room + 1)] : lines
			const cells = stream.columns ? stream.columns - 1 : Number.POSITIVE_INFINITY
			stream.write(shown.map((text) => fitToCells({ text, cells })).join('\n'))
			drawn = shown.length
		},
		close() {
			if (drawn === 0) return
			stream.write('\n')
			drawn = 0
		},
	}
}
