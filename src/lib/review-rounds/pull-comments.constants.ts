/** `lot review --pull`: how a pull request's line comment becomes a finding. */

/** A comment's leading severity word and its colon (`blocking:`, `should-fix:`, `should fix:`, `nit:`), any case. */
export const COMMENT_SEVERITY_PATTERN = /^\s*(blocking|should[- ]fix|nit)\s*:\s*/i

/** The severity of a comment that names none. */
export const DEFAULT_COMMENT_SEVERITY = 'should-fix'

/** The schema of a `pulled-comments.jsonl` line. */
export const PULLED_LINE_SCHEMA = 1

/** Why a pull stopped after a finding was written but its comment could not be marked pulled. */
export const ORPHAN_FINDING_REFUSAL =
	'{id} written, comment {comment} not marked pulled (a next pull adds it again): {reason}'
