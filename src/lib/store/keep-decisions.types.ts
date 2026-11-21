/** What a line of a lot's `keep.jsonl` decides: the lot's items kept on purpose (`keep`), or released (`unkeep`). */
export type KeepOp = 'keep' | 'unkeep'

/** A line of a lot's `keep.jsonl` (schema 1): every key required, no other. */
export type KeepLine = {
	schema: 1
	at: string
	op: KeepOp
	by: string
	reason: string
}

/**
 * A lot's keep as its one reader reads it: kept by its last line, or kept because the file cannot be trusted (a line
 * that does not read, counted; or a read error but "no file", its code). A lot not kept has no decision (undefined).
 */
export type KeepDecision = { kept: KeepLine } | { unreadable: number } | { unreadableFile: string }

/**
 * A lot's keep as every JSON output carries it (KEEP 3.6): who kept it, when and why, or the keep file that cannot be
 * trusted; `null` when the lot is not kept.
 */
export type KeepJson =
	| { reason: string; by: string; at: string }
	| { unreadable: number }
	| { unreadableFile: string }
	| null
