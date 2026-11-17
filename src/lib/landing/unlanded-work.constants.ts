/** Work a worktree holds that its base does not: `{count}`, `{base}` and the short `{commits}`. */
export const UNLANDED_WORK_TEXT = '{count} commit(s) of work not in {base}: {commits}'

/** Why a branch whose work all landed is still in use. */
export const NO_OWN_COMMIT_REASONS = {
	emptyReflog: 'nothing in its reflog',
	onlyCreation: 'no commit of its own in its reflog',
	sinceWorktree: 'no commit of its own since the worktree was made',
} as const
