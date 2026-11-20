/** Why `lot prune` keeps an item, or how it names a lot's landing; `{...}` filled. */
export const PRUNE_PLAN_TEXTS = {
	openLot: 'lot {lot} {state}',
	baseBranch: 'the base branch',
	mainBranch: 'the branch the main checkout is on',
	stackParent: 'the stack parent of {child}',
	damagedStack: 'a damaged stack.json in {child}: its parent is not known',
	stash: 'a stash was made on it',
	pendingHandover: 'a hand-over is pending on it: {name}',
	checkedOut: 'checked out in {worktree}',
	notMatched: 'not matched: {why}',
	deleteAnyway: '{lost}; to delete it anyway: cd {main} && git branch -D {branch}',
	stale:
		'stale: worktree gone, still {state}: {why}; if its work is abandoned: dialecte lot stop {lot}',
	canceled: 'canceled: nothing of it lands',
	landedTipGone: 'landed tip {tip} gone',
	worktreeGone: ', worktree gone',
	recreated: 'recreated since',
	notRegistered: 'not a registered worktree',
} as const
