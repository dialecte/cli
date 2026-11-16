import type { DecisionRow } from '../src/lib/review-rounds/review-rounds.types.ts'

/** A hand-over in a plain temporary folder of a scratch repository: never a lot of the store. */
export type PlainHandover = { root: string; folder: string }

/** A hand-over folder to run, and where it is run from. */
export type RunnableHandover = { cwd: string; folder: string }

/** What a `handover run` did, read from its lines and the folder. */
export type RunSummary = {
	exitCode: number
	/** The `lot` guard's lines, the printed folder shown as a placeholder. */
	lot: string[]
	/** The guards that refused, by name, in order. */
	failedGuards: string[]
	/** The rows of the folder's decisions file (none when it is absent). */
	rows: DecisionRow[]
	/** Whether the folder holds a decisions file. */
	hasDecisionsFile: boolean
	/** Whether the repository's HEAD moved. */
	committed: boolean
	/** The run's first line names the hand-over folder given. */
	namesFolder: boolean
	/** The lines starting `handover run: --` (usage errors). */
	usage: string[]
	/** The lines saying an option holds a forbidden word. */
	forbidden: string[]
	/** The run ended rehearsed. */
	rehearsed: boolean
}

/** A way of damaging a store lot's identity. */
export type IdentityDamage = 'unreadable' | 'otherName'
