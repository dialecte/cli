import type { InterleavingSeam } from '../lib/handover/handover.types.ts'

/** What the tests inject into `lotStop`: a seam between its steps. */
export type StopSeams = {
	/** Called between the check of the run marker and the write of the abandoned marker of the abandon (step 2). */
	afterCheck?: InterleavingSeam
	/** Called after the `canceled` transition is published and before the registry is read again (step 3). */
	afterCanceled?: InterleavingSeam
}

/** What `lotStop` takes: the words after the verb, the time, the seams. */
export type LotStopParams = {
	cwd: string
	/** The words after the verb: `<id>`, `--reason <text>`, `--by <who>`, `--json`. */
	argv: string[]
	now?: Date
	seams?: StopSeams
}
