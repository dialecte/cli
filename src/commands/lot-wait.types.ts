import type { StoreEntry } from '../lib/handover/handover.types.ts'
import type { PrintedText } from '../lib/print/print.types.ts'
import type { CheckedLotState } from '../lib/store/store.types.ts'

/** The time `lot wait` reads: epoch milliseconds (the system's in production, a hand-moved one in the tests). */
export type WaitClock = { now(): number }

/** What `lot wait` sleeps with: it resolves after `milliseconds` (a test's moves its clock instead of waiting). */
export type WaitSleep = (milliseconds: number) => Promise<void>

/**
 * One read of the wait loop: the registry's entries and the lot's records read with them, checked (a damaged lot
 * says why; none: no lot).
 */
export type WaitRead = { entries: readonly StoreEntry[]; checked: CheckedLotState | undefined }

/** What `waitLot` takes: the words after the verb, and the seams the tests inject. */
export type WaitParams = {
	cwd: string
	/** The words after the verb: `<id>` and the options. */
	argv: string[]
	/** The clock; the system's when left out. */
	clock?: WaitClock
	/** The sleep; a real one when left out. */
	sleep?: WaitSleep
	/** Whether the refreshing `waiting ...` line is written (a terminal); false when left out. */
	isTerminal?: boolean
	/** Where the refreshing line goes; the process's standard error when left out. */
	write?: (text: PrintedText) => void
	/**
	 * Called each time the wait loop reads the lot's records (transitions, answers, registry entry) while it waits; the
	 * status the wait answers with at the end is built apart and not counted.
	 */
	onRead?: () => void
}
