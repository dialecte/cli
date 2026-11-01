/** The throwaway worktree `review delta --worktree` makes on the previous round's snapshot. */
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

/** What `review delta --json` prints. */
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

/** A decision as `record decision` takes it: the state written, and the round a fix needs to beat. */
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

/** What `record snapshot` took. */
export type TakenSnapshot = {
	copied: number
	deleted: number
	base: string
}

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
