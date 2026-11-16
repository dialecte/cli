/** What `lot scope` was asked, its usage checked: the paths to drop and to add as given, who and why (both required). */
export type ScopeRequest = {
	id: string
	drops: string[]
	adds: string[]
	by: string
	reason: string
	/** `--overlap-ok`: an add meeting an open lot that names its paths is written, the overlap recorded. */
	overlapOk: boolean
}

/** A lot `lot scope` may change: its folder, name, worktree and repository, and its scope changes so far. */
export type ScopeTarget = {
	lotFolder: string
	name: string
	worktree: string | null
	repository: string
}

/** The points a test may act at, between the steps of a change. */
export type ScopeSeams = {
	/** Called once the change is appended, before the add re-reads the other open lots. */
	afterAppend?: () => void
}
