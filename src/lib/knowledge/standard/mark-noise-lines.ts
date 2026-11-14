import { NOISE_RUN_MINIMUM } from './standard-index.constants.ts'

import type { StandardClassifiedLine, StandardNoise } from './standard-index.types.ts'

/**
 * The one noise rule: a run of one-character prose lines at least the minimum long is dropped. Blank
 * lines inside a run neither break it nor count; any other line ends it. Nothing else is noise.
 * Returns, per original line in file order, whether it is dropped, and the original line range of each
 * dropped run (its first to its last one-character line, the blank lines inside it included).
 */
export function markNoiseLines(params: { lines: StandardClassifiedLine[] }): StandardNoise {
	const runs = droppedRunsOf(params.lines)
	const dropped = params.lines.map(() => false)
	for (const run of runs) for (const index of run) dropped[index] = true
	return {
		dropped,
		ranges: runs.map((run) => ({ from: run[0] + 1, to: run[run.length - 1] + 1 })),
	}
}

/** The indexes of each run of one-character prose lines at least the minimum long, in file order. */
function droppedRunsOf(lines: StandardClassifiedLine[]): number[][] {
	const runs: number[][] = []
	let run: number[] = []
	for (const [index, line] of lines.entries()) {
		if (line.kind === 'blank') continue
		if (line.kind === 'prose' && line.content.length === 1) {
			run.push(index)
			continue
		}
		if (run.length >= NOISE_RUN_MINIMUM) runs.push(run)
		run = []
	}
	if (run.length >= NOISE_RUN_MINIMUM) runs.push(run)
	return runs
}
