/** The version of a `scope-changes.jsonl` line. */
export const SCOPE_CHANGE_SCHEMA = 1

/** The most bytes a `scope-changes.jsonl` line may hold (one atomic append). */
export const SCOPE_CHANGE_LINE_LIMIT = 4_096

/** The keys a line may hold (`scope-change.schema.json`). */
export const SCOPE_CHANGE_KEYS = ['schema', 'at', 'op', 'paths', 'by', 'reason'] as const

/** The ops a line may hold. */
export const SCOPE_CHANGE_OPS = ['drop', 'add', 'undo'] as const

/** How readers name the changes: a drop, an add with who (and why when asked), joined; and an unreadable file. */
export const SCOPE_CHANGE_TEXTS = {
	dropped: 'dropped {paths}',
	undone: 'undid the add of {paths}',
	added: 'added {paths} (by {by})',
	addedWithReason: 'added {paths} (by {by}: {reason})',
	unreadable:
		'{count} line(s) of scope-changes.jsonl do not read: the overlap guard reads every path',
} as const

/** What joins the paths of one change, and the changes. */
export const SCOPE_PATHS_SEPARATOR = ', '
export const SCOPE_CHANGES_SEPARATOR = '; '
