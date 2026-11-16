/** Who gave a review's verdict: a review station of the lot's loop, a `lot verify` by its name, or a person. */
export type ReviewerOf =
	| { kind: 'station'; station: string; round?: number }
	| { kind: 'verify'; name: string }
	| { kind: 'person'; name: string }

/**
 * A finding of the ledger as a public row: never its text, nor a fix's note, an acceptance's reason or a log's where.
 * A cell the ledger parser cannot read is left out.
 */
export type FindingRow = {
	schema: 1
	kind: 'finding'
	id: string
	round?: number
	/** `blocking`, `should-fix` or `nit`. */
	severity?: string
	/** A path of the lot's tree (its worktree or its base holds it), without its line. */
	file?: string
	/** `open`, `fix-to-verify`, `fixed`, `accepted` or `logged`. */
	state?: string
	/** For `fixed`: the round that verified the fix. */
	closedBy?: { round: number }
}

/** A review's verdict: who gave it, the model words the host named, the verdict. */
export type VerdictRow = {
	schema: 1
	kind: 'verdict'
	/** ISO time. */
	at: string
	by: ReviewerOf
	vendor?: string
	model?: string
	verdict: string
}

/** A row of `review.jsonl`. */
export type ReviewRow = FindingRow | VerdictRow

/** The rows of a folder's `review.jsonl`, by kind, each in file order. */
export type ReviewRecord = { findings: FindingRow[]; verdicts: VerdictRow[] }

/** Whether a path names a file of the lot's tree; undefined when the folder names no worktree. */
export type TreeFileTest = ((path: string) => boolean) | undefined
