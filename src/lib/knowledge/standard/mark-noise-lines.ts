import { NOISE_RUN_MINIMUM } from './standard-index.constants.ts'

import type { StandardClassifiedLine, StandardNoise } from './standard-index.types.ts'

/**
 * The one noise rule: a run of one-character prose lines at least the minimum long is dropped. Blank
 * lines inside a run neither break it nor count; any other line ends it. Nothing else is noise.
 * Returns, per original line in file order, whether it is dropped, and the original line range of each
 * dropped run (its first to its last one-character line, the blank lines inside it included).
 */
export function markNoiseLines(params: { lines: StandardClassifiedLine[] }): StandardNoise {
	const found: StandardNoise = { dropped: params.lines.map(() => false), ranges: [] }
	let run: number[] = []
	for (const [index, line] of params.lines.entries()) {
		if (line.kind === 'blank') continue
		if (line.kind === 'prose' && line.content.length === 1) {
			run.push(index)
			continue
		}
		dropRun({ run, found })
		run = []
	}
	dropRun({ run, found })
	return found
}

function dropRun(params: { run: number[]; found: StandardNoise }): void {
	const { run, found } = params
	if (run.length < NOISE_RUN_MINIMUM) return
	for (const index of run) found.dropped[index] = true
	found.ranges.push({ from: run[0] + 1, to: run[run.length - 1] + 1 })
}
