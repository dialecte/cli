/** Why a removal would lose a commit: dropped from its branch (a branch reflog held it), or detached (a HEAD reflog only). */
export const LOST_WHYS = ['dropped', 'detached'] as const

/** Why a branch whose work all landed is still in use. */
export const NO_OWN_COMMIT_REASONS = {
	emptyReflog: 'nothing in its reflog',
	onlyCreation: 'no commit of its own in its reflog',
	sinceWorktree: 'no commit of its own since the worktree was made',
} as const

/**
 * The lines of the keep rules: `{count}` and the short `{commits}`. `lost`: what a removal would lose; `since`: a
 * merged lot's work beyond its landed tip; `droppedHeld`: commits a worktree removal leaves held by its branch's reflog
 * alone, said as information.
 */
export const LOST_WORK_TEXTS = {
	lost: '{count} commit(s) its removal would lose: {commits}',
	since: '{count} commit(s) made since its landing: {commits}',
	droppedHeld:
		"{commits}: dropped from the branch, kept in its reflog until git's reflog expiry (gc.reflogExpireUnreachable)",
} as const

/** The ref namespaces a removal's holders are read from. */
export const BRANCH_REF_PREFIX = 'refs/heads/'
export const TAG_REF_PREFIX = 'refs/tags/'
export const REMOTE_REF_PREFIX = 'refs/remotes/'
