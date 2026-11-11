/** What `handover review` prints. */
export const HANDOVER_REVIEW_TEXTS = {
	usage:
		'handover review: expected a hand-over: dialecte handover review <name|index|folder> [--json] [--print]',
	worktreeGone: 'handover review: {name}: its worktree {worktree} is gone',
	editorMissing: 'editor {word} not found: set git config {key}',
	opened: 'handover review: {editor} opens {paths}',
} as const

/** The indent of `handover review --json`. */
export const HANDOVER_REVIEW_JSON_INDENT = 2
