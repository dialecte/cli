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

/** A hand-over folder as `handover run` reads it back: the lots file and the snapshot written next to it. */
export type HandoverFolder = {
	/** Absolute path of the folder. */
	folder: string
	lotsFile: LotsFile
	/** Each lot with the files of `files.txt` its paths cover. */
	lots: ResolvedLot[]
	/** `<sha256>  <path>` lines of `files.sha256`. */
	snapshotLines: string[]
	/** sha256 of `lots.json` when the hand-over was written. */
	lotsHash: string
}

/** Lots already committed on top of the recorded HEAD, in order; or what else is there. */
export type CommittedLots = {
	/** The commit of each lot found, the first lot first. */
	commits: string[]
	/** What sits on top of the recorded HEAD that is not the next lot (a refusal), if anything. */
	foreign?: string
}

/** One lot on the card. */
export type CardLot = DiffSize & {
	index: number
	fileCount: number
	subject: string
	/** The lot's commit, once committed. */
	commit?: string
}

/** What a person reviews before running a hand-over, and sees again at its end. */
export type HandoverCard = {
	/** The main checkout of the repository. */
	repository: string
	/** Where the lots are committed (the main checkout, or a linked worktree of it). */
	worktree: string
	branch: string
	head: string
	gates: string
	lots: CardLot[]
	/** The command that runs the hand-over, with its absolute `cd`. */
	command: string
}

/** Where a hand-over stands, from the branch it commits on. */
export type HandoverState =
	| 'pending'
	| 'partly committed'
	| 'committed'
	| 'stale: HEAD moved by something else'
	| 'repository missing'
	| 'legacy script, state unknown'

/** One line of `handover list`. */
export type HandoverListing = {
	folder: string
	repository: string
	worktree: string
	branch: string
	/** Undefined for a legacy folder (no lots file). */
	lots: number | undefined
	/** Milliseconds since the hand-over was written. */
	age: number
	state: HandoverState
}

/** Prints one progress line of a running hand-over. */
export type WriteLine = (line: string) => void

/** A guard's verdict: a short detail on its line, and the lines that explain a refusal. */
export type GuardVerdict = { ok: boolean; detail: string; lines?: string[] }

/** Where the guards leave a run: the full recorded HEAD and the lots committed already. */
export type GuardedRun = { head: string; commits: string[] }
