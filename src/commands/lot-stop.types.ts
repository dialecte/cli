import type { InterleavingSeam } from '../lib/handover/handover.types.ts'

/** What the tests inject into `lotStop`: a seam between its steps. */
export type StopSeams = {
	/** Called between the check of the run marker and the write of the abandoned marker of the abandon (step 2). */
	afterCheck?: InterleavingSeam
	/** Called after the `canceled` transition is published and before the registry is read again (step 3). */
	afterCanceled?: InterleavingSeam
	/** A damaged lot: called once its folder is read as damaged and its run marker checked, before it is moved aside. */
	beforeMoveAside?: InterleavingSeam
}

/** What the abandon of a stop's hand-over gave: the line of what became of the lock, or why it was refused. */
export type StopAbandon = { lockLines: string[] } | { refused: string }

/** What `lotStop` takes: the words after the verb, the time, the seams. */
export type LotStopParams = {
	cwd: string
	/** The words after the verb: `<id>`, `--reason <text>`, `--by <who>`, `--json`. */
	argv: string[]
	now?: Date
	seams?: StopSeams
}
