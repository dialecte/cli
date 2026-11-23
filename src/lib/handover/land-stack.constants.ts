/** `lot land` of a stacked lot (33CI CI4): its lines; `{…}` placeholders filled. */
export const STACK_LANDING_LINES = {
	damaged: 'lot land: {lot} is damaged: its {damage}, nothing pushed',
	noParent:
		'lot land: {lot} stacks on {parent}, whose records do not read: dialecte lot status {parent} says how, nothing pushed',
	parentNotRecorded:
		'lot land: {lot} stacks on {parent}, merged, whose landed fact cannot be written ({reason}): nothing pushed',
	noParentChangeRequest:
		'lot land: {lot} stacks on {parent}, which has no {changeRequestNoun} yet: lot land {parent} first, nothing pushed',
	conflict:
		'lot land: rebasing {lot} onto {onto} conflicts in {files}: the rebase is undone, nothing pushed',
	notUndone:
		'lot land: rebasing {lot} onto {onto} conflicts in {files} and git rebase --abort failed ({reason}): the worktree is mid-rebase, run git rebase --abort there by hand; nothing pushed',
	dirty:
		'lot land: {lot} must be rebased onto {onto} and its worktree holds uncommitted changes to tracked files: commit or move them, nothing pushed',
	restacked: 'rebased onto {parent} {commit} (its branch moved)',
	offParent: 'rebased off {parent} onto origin/{base} {commit} ({merged} merged)',
	followed: 'follows the host: {branch} rebased onto origin/{base} at {commit}',
	linked: 'stacked on #{number}: linked as a stack',
	basedOn: 'stacked on #{number} through its base branch {branch}: {why}',
	retargeted: '{changeRequestNoun} #{number} now merges into {base}',
} as const

/** The exit of a rebase that stopped on a conflict: nothing resolved, the person decides. */
export const STACK_CONFLICT_EXIT = 2
