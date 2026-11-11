import type { BriefWorkspace } from './brief-workspace.types.ts'

/** What a worktree of a committed hand-over holds besides the commit of its lot. */
export type LotCommit = 'matching' | 'foreign'

/** Where the hand-over folder is: the lot folder of the store, or a folder outside it. */
export type HandoverPlace = 'store' | 'outside'

/** A hand-over of a real worktree, committed, ready for `lot close`. */
export type ClosableHandover = {
	workspace: BriefWorkspace
	/** The lot's full name (the worktree folder has the same name); null outside the store the lot has none. */
	lotName: string
	/** The name the hand-over is registered under. */
	handover: string
	/** The real path of the worktree. */
	worktree: string
	branch: string
	/** The commit the worktree was made at. */
	base: string
	/** The worktree's HEAD, full sha. */
	tip: string
	/** The hand-over folder (real path). */
	folder: string
	/** The lot folder; undefined for a hand-over outside the store. */
	lotFolder: string | undefined
}

/** One line of `cards.log` as the cases read it. */
export type LogLine = Record<string, any>

/** What one `lot close` call answered. */
export type ClosingResult = {
	exitCode: number
	outcomes: unknown
	calls: { command: string; args: string[]; cwd?: string }[]
}
