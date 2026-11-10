import type { ScopedHookGate } from './scoped-hook-package.types.ts'

/** What a lot with a hand-over is made of. */
export type HandoverLotParams = {
	/** The package's gate lists (`gate --hook` and the gate records read them); a function of the marker folder. */
	gate?: ScopedHookGate | ((markerFolder: string) => ScopedHookGate)
	/** The commit hook's script (a function of the marker folder); default: one that prints a passing hook summary. */
	hookScript?: string | ((markerFolder: string) => string)
	/** Write the hand-over into a folder of its own, outside every store, instead of the lot's folder. */
	outside?: boolean
}

/** A repository holding a real lot (its worktree is the repository itself) whose folder holds the hand-over. */
export type HandoverLot = {
	/** The repository's real path: the lots file's repository, the commit root of a real run. */
	root: string
	/** The worktree the lot's identity names: a linked worktree, not the commit root. */
	identityWorktree: string
	/** Another lot of the store: its worktree is where commands run, its events file must stay empty. */
	bystander: { worktree: string; eventsFile: string }
	lotName: string
	/** The real path of the lot folder. */
	lotFolder: string
	/** The hand-over folder: the lot folder, or the folder outside every store when asked. */
	folder: string
	eventsFile: string
	/** The folder the heavy markers go to (it may not exist yet). */
	markerFolder: string
}
