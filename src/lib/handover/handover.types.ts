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
	lots: Array<LotPlan | MergeLotPlan>
}

export type LotPlan = {
	/** Files, or folders ending with `/`, relative to the repository. */
	paths: string[]
	/** The commit message: a subject line, then an optional body after a blank line. */
	message: string
}

/**
 * A lot that merges a branch: `handover run` runs `git merge --no-ff --no-commit <branch>`, checks the
 * conflicts against `resolved` (the conflicting files, each with the file holding its resolution, relative to
 * the lots file), copies the resolutions, and commits `message`. `tip` is the branch tip the merge was
 * reviewed at; `tree` (optional) is the tree the merge commit must hold, as `handover run --rehearse` reports it.
 */
export type MergeLotPlan = {
	kind: 'merge'
	branch: string
	tip: string
	/** Each path with the file holding its content, or `null`: the merge removes it (`git rm`). */
	resolved: Record<string, string | null>
	message: string
	tree?: string
}

/** A lot with the changed files its paths cover; a merge lot covers none, it merges `merge`. */
export type ResolvedLot = {
	message: string
	/** Changed files of the lot that exist, sorted. */
	files: string[]
	/** Files of the lot deleted against HEAD, sorted. */
	deletedFiles: string[]
	merge?: MergeLot
}

/**
 * A merge lot as the hand-over recorded it: the tip it merges, the conflicts the merge holds (a trial merge
 * at the write), each resolution with its file and sha256, and the tree the commit must hold (rehearsed).
 */
export type MergeLot = {
	branch: string
	/** The full sha of the reviewed tip. */
	tip: string
	tree?: string
	/** The conflicting files of the merge, sorted. */
	conflicts: string[]
	/** Every resolved file (a conflict, or a file the lot changes on top of a clean merge), sorted by path. */
	resolutions: MergeResolution[]
}

/**
 * A file of the merge as the lot commits it: its path, the file holding its content and that file's
 * sha256; or removed by the merge.
 */
export type MergeResolution =
	| { path: string; file: string; sha256: string }
	| { path: string; removed: true }

/** What a trial merge (`git merge-tree`) answers: the merged tree, the conflicting paths and their modes. */
export type TrialMerge = { tree: string; conflicts: string[]; modes: Map<string, Set<string>> }

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
	/** sha256 of `merges.json` when the hand-over was written (a hand-over with a merge lot). */
	mergesHash?: string
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
	/** After a run: the new tip of the branch (the card shows `HEAD base → tip`). */
	tip?: string
	gates: string
	/** The test receipts for the reviewer: the lot's exemption, the flags receipts carry (one per line). */
	tdd?: string
	lots: CardLot[]
	/** The merges of the hand-over, one line each: the tip merged, the conflicts resolved, the tree. */
	merges?: string[]
	/** The command that runs the hand-over, with its absolute `cd`. */
	command: string
	/** Every lot is committed: the card says done instead of the command. */
	done?: boolean
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

/** Brings `node_modules` to the lock of the repository at `root`: its exit code and what it printed. */
export type Installer = (params: {
	root: string
}) => Promise<{ exitCode: number | undefined; output: string }>
