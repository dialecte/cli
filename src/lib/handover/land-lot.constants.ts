/** `lot land`: the landing record and the lines it prints; `{…}` placeholders filled. */

/** The landing record in the lot's store folder: the change request it lands through. */
export const LANDING_FILE = 'landing.json'
export const LANDING_SCHEMA = 1

/** The line of git's push output that says why a ref was rejected. */
export const PUSH_REJECTED_PATTERN = /!\s*\[(rejected|remote rejected)\].*$/m

export const LANDING_LINES = {
	updated: '{changeRequestNoun} #{number} updated from the lot records',
	unrendered: 'lot land: {reason}',
	noBase: 'lot land: origin holds no branch {base} to land on: nothing pushed',
	notOnBranch:
		'lot land: {worktree} is not on {branch} (HEAD is {head}): switch to it first, nothing pushed',
	fetchFailed:
		"lot land: {reason}: nothing pushed (the lot is rebased only onto the host's base branch)",
	conflict:
		'lot land: rebasing onto origin/{base} conflicts in {files}: the rebase is undone; merge origin/{base} into the lot and resolve, then land again',
	overwrite:
		'lot land: rebasing onto origin/{base} would overwrite untracked files: {files}: the rebase is undone; move them aside, then land again, nothing pushed',
	baseConflict:
		'lot land: the lot conflicts with origin/{base} in {conflicts}: merge origin/{base} into the lot and resolve, then land again: nothing pushed',
	forecastUnknown:
		'lot land: the forecast against origin/{base} cannot run: {reason}: nothing pushed',
	pairHeld: '! {lot}: {hold}',
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
	// a lot kept on purpose: its close would keep every item, landing again records the merge (KEEP 3.8)
	closeWhenMergedKept: 'once merged: dialecte lot land {lot} again (it records the merge; {kept})',
	opened: '{changeRequestNoun} #{number} opened: {url}',
	existing: '{changeRequestNoun} #{number}: {url}',
	draft:
		'a draft: CI runs on every push; dialecte lot approve {lot} --by <who> queues it once its checks pass',
	drafted:
		'{changeRequestNoun} #{number} back to a draft, out of the queue: an approval is for one head',
	hostRefused: 'lot land: {reason}',
	committed: 'the lot is committed, nothing pushed: {landed}',
	workSince: 'the lot holds {work}: they land in a new lot',
	closeLanded: 'close it: dialecte lot close {lot}',
	closeLandedKept: '{kept}; to release it: {next}',
} as const

/** What git says when a lease that expected no branch finds one on origin: it was pushed outside `lot land`. */
export const PUSHED_OUTSIDE_PATTERN = /stale info|already exists|fetch first/

/** How `git status --porcelain` starts the line of an untracked path. */
export const UNTRACKED_STATUS_PREFIX = '??'

/** git's error line when a checkout of the rebase would overwrite untracked files; the files follow, tab-indented. */
export const OVERWRITE_PATTERN = /untracked working tree files would be overwritten/
