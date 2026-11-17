/** `lot land` of a stacked lot (33CI CI4): its lines; `{…}` placeholders filled. */
export const STACK_LANDING_LINES = {
	damaged: 'lot land: {lot} is damaged: its {damage}, nothing pushed',
	noParent:
		'lot land: {lot} stacks on {parent}, whose records do not read: dialecte lot status {parent} says how, nothing pushed',
	noParentPull:
		'lot land: {lot} stacks on {parent}, which has no pull request yet: lot land {parent} --draft first, nothing pushed',
	waits:
		'lot land: {lot} waits for #{number} ({parent}) to merge: without native stacks a stacked lot queues after its parent, nothing pushed',
	notRewritten:
		'lot land: #{number} ({parent}) merged and the host has not rebased {branch} yet: land again once it has, nothing pushed',
	conflict:
		'lot land: rebasing {lot} onto {onto} conflicts in {files}: the rebase is undone, nothing pushed',
	notUndone:
		'lot land: rebasing {lot} onto {onto} conflicts in {files} and git rebase --abort failed ({reason}): the worktree is mid-rebase, run git rebase --abort there by hand; nothing pushed',
	dirty:
		'lot land: {lot} must be rebased onto {onto} and its worktree holds uncommitted changes to tracked files: commit or move them, nothing pushed',
	restacked: 'rebased onto {parent} {commit} (its branch moved)',
	offParent: 'rebased off {parent} onto origin/{base} {commit} (#{number} merged)',
	followed: 'follows the host: {branch} rebased onto origin/{base} at {commit}',
	linked: 'stacked on #{number}: linked as a stack',
	basedOn: 'stacked on #{number} through its base branch {branch}: {why}',
	retargeted: 'pull request #{number} now merges into {base}',
	stackQueued: 'queued as a stack up to #{number}: the merge queue lands it with the layers below',
} as const

/** The exit of a rebase that stopped on a conflict: nothing resolved, the person decides. */
export const STACK_CONFLICT_EXIT = 2
