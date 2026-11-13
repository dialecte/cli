/** The throwaway worktree `lot delta --worktree` makes on the previous round's snapshot. */
export type ReviewThrowaway = {
	/** The throwaway worktree's folder. */
	path: string
	/** Its branch: `<lot branch>-round-<n-1>`. */
	branch: string
	/** The removal command, with its absolute `cd` into the main checkout. */
	removal: string
}

/** How a file's fix diff is taken, by where the file is. */
export type ReviewDeltaForm = string

/** One file of a fix diff: its path relative to the root, the form of its diff, git's diff output as is. */
export type ReviewDeltaFile = {
	path: string
	form: ReviewDeltaForm
	diff: string
}

/** What `lot delta --json` prints. */
export type ReviewDelta = {
	round: number
	/** `<folder>/round-<n-1>`. */
	previous: string
	/** The lot's worktree root. */
	root: string
	files: ReviewDeltaFile[]
	throwaway?: ReviewThrowaway
}

/** One row of the findings ledger table, by its line in the file. */
export type LedgerRow = {
	/** Index of its line in the file's lines. */
	line: number
	id: string
	round: number | undefined
}

/** The findings table of a ledger: where it is and the rows it holds, in file order. */
export type LedgerTable = {
	/** Index of the last line of the table (the separator when no row yet). */
	lastLine: number
	rows: LedgerRow[]
}

/** A markdown table among a file's lines: the indexes of its row lines and of its last line. */
export type MarkdownTable = {
	/** Index of the last line of the table (the separator when no row yet). */
	lastLine: number
	/** Index of each row's line, in file order. */
	rowLines: number[]
}

/** One row of `decisions.md`: a decision made outside the findings ledger, who made it, when. */
export type DecisionRow = {
	decision: string
	by: string
	when: string
}

/** A decision as `lot decide` takes it: the state written, and the round a fix needs to beat. */
export type DecisionState = {
	written: string
	/** For `fixed <round>`: the round that verified the fix. */
	fixedRound?: number
}

/** The paths `git status` lists at a worktree's root: new paths and the old path of each rename or copy. */
export type StatusListing = {
	paths: string[]
	/** Untracked folders holding a repository of their own (listed with a trailing `/`). */
	nestedRepositories: string[]
}

/** What `lot snapshot` took. */
export type TakenSnapshot = {
	copied: number
	deleted: number
	base: string
}

/** The go-ahead of `lot snapshot --beyond-cap` for a round above the cap. */
export type SnapshotGoAhead = {
	by: string
	reason: string
}

/** An option a forbidden word is looked for in: its spelling (`--by`) and the text it was given. */
export type ForbiddenWordOption = {
	option: string
	text: string
}

/** `round-<n>.state`: when the round was taken and the worktree's state hash then (33L1 D7). */
export type RoundState = {
	schema: 1
	/** ISO time. */
	at: string
	/** `computeStateHash` of the worktree. */
	stateHash: string
}

/** One line of a lot's `verify.jsonl`: a late fix verified, `state` the worktree's state hash it covers (33L1 D19). */
export type VerifyLine = {
	schema: 1
	/** ISO time. */
	at: string
	by: string
	note: string
	/** `computeStateHash` of the worktree when `lot verify` ran. */
	state: string
}

/**
 * The late fixes of a lot (33L1 6b): changes of its tree after the last snapshot. `none`: no snapshot, or the tree is
 * the last snapshot's; `not-checked`: the last snapshot has no `.state` (an older cli); `verified`: the last
 * `verify.jsonl` line covering the current tree; `unverified`: `files` files differ from `round-<round>/`.
 */
export type LateFixes =
	| { kind: 'none' }
	| { kind: 'not-checked'; round: number }
	| { kind: 'verified'; by: string; note: string }
	| { kind: 'unverified'; round: number; files: number }

/** Where a file is, for the form of its fix diff. */
export type DeltaSides = {
	inPrevious: boolean
	inDeleted: boolean
	inWorktree: boolean
	atBase: boolean
}

/** A subcommand's words split by the options it knows. */
export type RoundArguments = {
	/** Value options by name, without the dashes. */
	values: Map<string, string>
	flags: Set<string>
	/** Repeatable options by name, without the dashes: every value given, in order. */
	lists: Map<string, string[]>
	/** The positional words, those after `--` included. */
	words: string[]
}

/** The files at HEAD: blobs and symlinks, and the gitlinks of submodules. */
export type HeadFiles = {
	files: Set<string>
	submodules: Set<string>
}

/** What a snapshot or a delta reads of the worktree before touching anything. */
export type WorktreeState = {
	status: StatusListing
	head: HeadFiles
	/** The submodules HEAD or the index holds as gitlinks. */
	submodules: Set<string>
}

/** One row of a findings ledger as the review rounds read it: its round (when it names one) and, while open, its severity. */
export type ReviewLedgerRow = { round: number | undefined; openSeverity: string | undefined }

/** A hand-over folder's findings ledger as the review rounds read it; `exists` false without a readable file. */
export type ReviewLedger = { exists: boolean; rows: ReviewLedgerRow[] }
