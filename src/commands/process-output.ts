/** Where `run`, `fixture` and `explain` write in the real cli: the process's streams, through the print boundary. */
import { printOut } from '../lib/print/print.ts'

import type { CommandOutput } from './run.types.ts'

/** The process's standard output and error, each text followed by a line feed. */
export function processOutput(): CommandOutput {
	return {
		stdout: function printAnswer(text) {
			printOut({ stream: 'stdout', text })
		},
		stderr: function printProblem(text) {
			printOut({ stream: 'stderr', text })
		},
	}
}
