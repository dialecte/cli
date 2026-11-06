import type { CardLine } from '../card/card.types.ts'
import type { CardGateLine, CheckKey, GateRecordMode } from '../gate-records/gate-records.types.ts'
import type { Profile } from '../profile/profile.types.ts'
import type { LotCaseEntry, TddReceipt } from '../tdd/tdd.types.ts'

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
	/**
	 * The full sha of the tree the merge was trial-merged on: HEAD's tree for the first lot, else the tree
	 * the lots before it leave (an earlier merge's trial tree with its resolutions, a plain lot's files as
	 * they are in the working tree on top). The run refuses the lot when HEAD's tree is another one.
	 */
	onTree: string
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

/**
 * What the lots before a merge lot leave, as git objects no ref points to: a commit (for `git merge-tree`
 * and its merge base) and its tree.
 */
export type TrialBase = { commit: string; tree: string }

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

/** Files changed and lines added and removed between two trees. */
export type TreeDiffSize = DiffSize & { fileCount: number }

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
	/** Not committed yet. */
	pending?: true
	/** A merge lot: what it merges, its conflicts, the tree it must hold (or that it is not recorded). */
	merge?: string
	/** A merge lot whose tree is not recorded yet: no size until a rehearsal records it. */
	notSized?: true
}

/** The card's first word: every gate green, a gate blocking it, every lot committed, or abandoned. */
export type HandoverVerdict = 'READY' | 'BLOCKED' | 'DONE' | 'ABANDONED'

/** What a person reviews before running a hand-over, and sees again at its end. */
export type HandoverCard = {
	/** The main checkout of the repository. */
	repository: string
	/** Where the lots are committed (the main checkout, or a linked worktree of it). */
	worktree: string
	/** The worktree's index when its folder is numbered (`0171-cli-x` → `0171`): the title shows it. */
	index?: string
	branch: string
	head: string
	/** After a run: the new tip of the branch (the card shows `HEAD base → tip`). */
	tip?: string
	/**
	 * `ABANDONED` when `handover abandon` marked it, `DONE` once every lot is committed, else `BLOCKED` when a
	 * gate failed or ran on another tree, else `READY`.
	 */
	verdict: HandoverVerdict
	/** The gate lines that failed, by name, in card order. */
	failedGates: string[]
	/** The gate lines recorded on another tree than the worktree's now (not failed), by name, in card order. */
	otherTreeGates: string[]
	/** The entries a person must read: revised receipts, gone test files, unused lot file entries. */
	declarations: number
	/** The gate steps (the latest record of each) and the review, one line each. */
	gates: CardGateLine[]
	/** The package's profile: a contributor's card holds the `contrib` section. */
	profile: Profile
	/** A contributor's contrib rows (the rules, the package steps, release, mutation), one line each; none for a consumer. */
	contrib?: CardGateLine[]
	/**
	 * The lots file's `gates` text: the agent's caveats for the person about to run; absent when the lots file
	 * has none and on the card a real run prints after it.
	 */
	notes?: string
	/**
	 * The test receipts for the reviewer, as the card's tdd lines: the lot's exemption, the counts, the
	 * accepted reasons, the entries to read, the flags.
	 */
	tdd?: CardLine[]
	lots: CardLot[]
	/** The merges of the hand-over, one line each: the tip merged, the conflicts resolved, the tree. */
	merges?: string[]
	/** The command that runs the hand-over, with its absolute `cd`. */
	command: string
	/** Every lot is committed: the card says done instead of the command. */
	done?: boolean
	/** The hand-over's registered name; absent for a folder with no entry in the store. */
	name?: string
	/** The hand-over folder (absolute): the footer names it when the hand-over has no entry in the store. */
	folder?: string
}

/** The card as `--json` answers it: the tdd lines as plain text, every other field as the card holds it. */
export type HandoverCardData = Omit<HandoverCard, 'tdd'> & { tdd?: string[] }

/** Where a hand-over stands, from the branch it commits on. */
export type HandoverState =
	| 'pending'
	| 'partly committed'
	| 'committed'
	| 'stale: HEAD moved by something else'
	| 'repository missing'
	| 'abandoned'
	| 'legacy script, state unknown'

/** The state an entry of the store records: as last written, read only once its folder is gone. */
export type HandoverEntryState = 'pending' | 'committed' | 'abandoned'

/**
 * An entry of the store (`<name>.json`): the hand-over folder (absolute, as written), the lots file's branch
 * and repository, when the hand-over was written (ISO time), and its state as last recorded.
 */
export type HandoverStoreEntry = {
	folder: string
	branch: string
	worktree: string
	/** The worktree's index when its folder is numbered: `handover show <index>` finds the entry by it. */
	index?: string
	written: string
	state: HandoverEntryState
}

/** An entry of the store with its name. */
export type StoreEntry = HandoverStoreEntry & { name: string }

/** Where a registered hand-over stands in a listing of the store: its folder's state, or `gone` without it. */
export type RegisteredState = HandoverState | 'gone'

/** Where a name of the store sorts among the names of its branch: its date, then its counter (1 without one). */
export type StoreNameRank = { date: string; counter: number }

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
export type GuardVerdict = {
	ok: boolean
	/** The run goes on, and the line is marked `!`: a refusal a rehearsal tolerates. */
	warning?: true
	detail: string
	lines?: string[]
}

/** Where the guards leave a run: the full recorded HEAD and the lots committed already. */
export type GuardedRun = { head: string; commits: string[] }

/** Brings `node_modules` to the lock of the repository at `root`: its exit code and what it printed. */
export type Installer = (params: {
	root: string
}) => Promise<{ exitCode: number | undefined; output: string }>

/** A package entry of a staged `package-lock.json`, as the lock sync reads it. */
export type StagedLockEntry = {
	version?: string
	link?: boolean
	/** The package has an install script, which the lock sync does not run. */
	hasInstallScript?: boolean
} & Record<string, unknown>

/** A case's last proof, as the card's tdd counts read it: still red, proven red → green, unchanged, kept. */
export type TddProof = 'red' | 'proven' | 'unchanged' | 'kept'

/** An accepted or revised receipt with the lot file entry that names its case. */
export type DeclaredReceipt = { receipt: TddReceipt; entry: LotCaseEntry }

/**
 * Whether a gate may run while the repository's hand-over lock is held: free (no lock), under the hand-over
 * written for this repository (its folder), or refused (why).
 */
export type HandoverHold =
	| { held: false }
	| { held: true; folder: string }
	| { held: true; refusal: string }

/** A real `handover run` in progress, as its folder's marker names it. */
export type HandoverRunMarker = { pid: number; startedAt: string }

/** What `handover abandon` writes in the folder: when the hand-over was abandoned (ISO time). */
export type HandoverAbandonedMarker = { at: string }

/** The links a rehearsal made beside its clone, and the lines saying what it linked and what it could not. */
export type RehearsalLinks = { links: string[]; lines: string[] }

/** What a rehearsal decides for one lot: rehearse it in a scratch clone, or reuse a green record of its tree. */
export type RehearsalDecision = {
	/** The lot's number, from 1. */
	lot: number
	/** The tree the lot's commit will leave. */
	tree: string
	decision: 'reused' | 'rehearsed'
	reason: string
	/** The record reused. */
	record?: { mode: GateRecordMode; at: string; head: string }
	/** A contributor's lot whose tree has no green contrib record: the rehearsal runs `dialecte contrib` in the clone. */
	contrib?: 'run'
}

/** A rehearsal's decision for a lot, before its number and tree are added. */
export type LotDecision = Omit<RehearsalDecision, 'lot' | 'tree'>

/** What every lot's decision of a rehearsal reads: the repository, what is installed, the commands, the hook. */
export type RehearsalPlanContext = {
	root: string
	/** The branch the hand-over commits on. */
	branch: string
	installed: Pick<CheckKey, 'lockHash' | 'linked'>
	/** The command hash a record of each mode must hold to be reused. */
	commands: { full: string; hook: string }
	/** What the commit hook's text names that stages files, if anything. */
	stages: string | undefined
}

/** The tree a lot of a hand-over starts from and the tree its commit will hold. */
export type LotTree = { before: string; tree: string }

/** Whether the repository's own cli runs hand-overs (`handover run --probe`), within `timeout` milliseconds. */
export type HandoverProbe = (params: { root: string; timeout: number }) => boolean

/**
 * A callback a test injects to force an order of two writers: called between a check and the write that
 * follows it (or between a name's pick and its write), so the other writer can act in that gap.
 */
export type InterleavingSeam = () => void
