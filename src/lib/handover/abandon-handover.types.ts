import type { InterleavingSeam } from './handover.types.ts'

/** What `abandonHandover` takes: the hand-over folder, the repository whose lock it may release, the time, a seam. */
export type AbandonHandoverParams = {
	/** The hand-over folder (a plain hand-over folder or a lot folder). */
	folder: string
	/** The repository whose store and lock are used; the lots file's repository when left out. */
	repository?: string
	/** The hand-over registry the entry is recorded in, given when it is known without the repository (a lot's). */
	registry?: string
	/** The lock file that may name the hand-over, given when it is known without the repository (a lot's worktree). */
	lockPath?: string
	now: Date
	/** Called between the check of the run marker and the write of the abandoned marker (a test forces a run there). */
	afterCheck?: InterleavingSeam
}

/** What `abandonHandover` did: `abandoned` it now, `already` abandoned, or `refused` (a run crosses it, or it is committed). */
export type AbandonHandoverResult = {
	state: 'abandoned' | 'already' | 'refused'
	message: string
	/** Whether the repository's lock was removed (it named this hand-over). */
	released: boolean
}

/** What became of a repository's lock: the line saying so (none without a lock), and whether it was removed. */
export type LockRelease = { lines: string[]; released: boolean }
