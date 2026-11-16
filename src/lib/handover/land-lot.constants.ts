/** `lot land`: the landing record and the lines it prints; `{…}` placeholders filled. */

/** The landing record in the lot's store folder: the pull request it lands through. */
export const LANDING_FILE = 'landing.json'
export const LANDING_SCHEMA = 1

/** The pull request body until the lot's records render it (33CI CI2). */
export const LANDING_BODY = 'Lot {lot}. The full suite runs on CI; the merge queue lands it.'

/** Above the other commit messages of a brief with several commit lots, in the pull request body. */
export const LANDING_OTHER_MESSAGES = 'Its other commit lots:'

/** The line of git's push output that says why a ref was rejected. */
export const PUSH_REJECTED_PATTERN = /!\s*\[(rejected|remote rejected)\].*$/m

export const LANDING_LINES = {
	noMessage: 'lot land: {brief} names no commit message (lots[0].message): nothing pushed',
	retitled: 'pull request #{number} retitled: {title}',
	notOnBranch:
		'lot land: {worktree} is not on {branch} (HEAD is {head}): switch to it first, nothing pushed',
	fetchFailed:
		"lot land: {reason}: nothing pushed (the lot is rebased only onto the host's base branch)",
	conflict:
		'lot land: rebasing onto origin/{base} conflicts in {files}: the rebase is undone; merge origin/{base} into the lot and resolve, then land again',
	overwrite:
		'lot land: rebasing onto origin/{base} would overwrite untracked files: {files}: the rebase is undone; move them aside, then land again, nothing pushed',
	rebased: 'rebased onto origin/{base} {commit}',
	notRebased:
		'not rebased onto origin/{base}: the worktree holds uncommitted changes (CI tests the merge with {base}; land again once committed)',
	workInProgress: 'uncommitted, not pushed: {files}',
	pushed: 'pushed {branch} {commit}',
	pushRefused: 'lot land: the push of {branch} was refused: {reason}',
	pushedOutside:
		'lot land: {branch} exists on origin, pushed outside lot land: nothing overwritten; delete it there or land the lot on another branch',
	registryRefused: 'lot land: {reason}: nothing pushed',
	closeWhenMerged: 'once merged: dialecte lot close {entry} (or lot land {lot} again)',
	hostSilent:
		'pull request #{number}: the host could not say whether it merged ({reason}): the lot stays pending',
	opened: 'pull request #{number} opened: {url}',
	existing: 'pull request #{number}: {url}',
	draft: 'a draft: CI runs on every push; land it again without --draft to queue it',
	notDraft:
		'pull request #{number} is open and not a draft: --draft does not turn it back, it is not queued',
	queued: 'queued: the merge queue lands it once its checks pass on top of main',
	hostRefused: 'lot land: {reason}',
	committed: 'pull request #{number} merged at {commit}: the lot is committed ({url})',
	mergedThenMoved:
		'lot land: pull request #{number} merged at {merged}, the lot holds commits since ({head}): they land in a new lot, nothing pushed',
} as const

/** What git says when a lease that expected no branch finds one on origin: it was pushed outside `lot land`. */
export const PUSHED_OUTSIDE_PATTERN = /stale info|already exists|fetch first/

/** How `git status --porcelain` starts the line of an untracked path. */
export const UNTRACKED_STATUS_PREFIX = '??'

/** git's error line when a checkout of the rebase would overwrite untracked files; the files follow, tab-indented. */
export const OVERWRITE_PATTERN = /untracked working tree files would be overwritten/
