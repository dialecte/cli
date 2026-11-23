/** A change request's line comment read as a finding: its severity (the option form), where, and its text. */
export type CommentFinding = {
	comment: number
	severity: string
	at: string
	finding: string
}

/** A line of `pulled-comments.jsonl`: the comment of which change request became which finding. */
export type PulledLine = {
	schema: number
	at: string
	number: number
	comment: number
	finding: string
}
