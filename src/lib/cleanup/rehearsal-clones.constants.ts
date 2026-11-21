/** Why `lot close --feature` keeps a rehearsal clone; `{...}` filled. Each but the link's names `worktree prune`. */
export const CLONE_KEEP_TEXTS = {
	otherHandover:
		'a rehearsal of {handover}, no hand-over of the feature: decided by cd {workspace} && dialecte worktree prune',
	noHandover:
		'its rehearsal marker names no hand-over ({why}): decided by cd {workspace} && dialecte worktree prune',
	alive:
		'its rehearsal still runs: pid {pid}; once it ends: cd {workspace} && dialecte worktree prune',
	unknown: '{why}; decided by cd {workspace} && dialecte worktree prune',
	link: 'the link {link} points to it',
	changed: 'changed since the plan: {why}',
	gone: 'gone since the plan',
	notRecorded:
		'its removing line could not be written, nothing moved: {reason}; decided by cd {workspace} && dialecte worktree prune',
	notMoved: '{reason}; decided by cd {workspace} && dialecte worktree prune',
	process:
		'a process works in it: pid {pid}; once it ends: cd {workspace} && dialecte worktree prune',
	unreadable:
		'it could not be read ({reason}): decided by cd {workspace} && dialecte worktree prune',
} as const
