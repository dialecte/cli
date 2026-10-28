/** `dialecte handover <lots.json>`: what the hand-over commits, where, on top of what. */
export type LotsFile = {
	/** Absolute path of the repository (or worktree) the script commits in. */
	repository: string
	/** The branch the script must find checked out. */
	branch: string
	/** The commit the lots go on top of (a sha or a prefix of one). */
	head: string
	/** The gates run before the hand-over, with their real counts: written in the script's header. */
	gates?: string
	lots: LotPlan[]
}

export type LotPlan = {
	/** Files, or folders ending with `/`, relative to the repository. */
	paths: string[]
	/** The commit message: a subject line, then an optional body after a blank line. */
	message: string
}

/** A lot with the changed files its paths cover. */
export type ResolvedLot = {
	message: string
	/** Changed files of the lot that exist, sorted. */
	files: string[]
	/** Files of the lot deleted against HEAD, sorted. */
	deletedFiles: string[]
}

export type HandoverPlan = {
	repository: string
	branch: string
	/** HEAD as a full sha. */
	head: string
	gates: string | undefined
	lots: ResolvedLot[]
}

/** One lot as the hand-over prints it, so an empty or unexpected diff is visible before the run. */
export type LotSummary = DiffSize & {
	index: number
	subject: string
	fileCount: number
	/** sha256 of the lot's lines in files.sha256: the snapshot the script will check. */
	snapshot: string
}

/** The plan a script is written from, and every reason it is refused (none: it may be written). */
export type PlannedHandover = { plan: HandoverPlan; refusals: string[] }

/** Lines a lot adds and removes against HEAD. */
export type DiffSize = { insertions: number; deletions: number }
