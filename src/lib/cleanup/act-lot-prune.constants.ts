/** What `lot prune`'s acts say of an item they did not remove; `{...}` filled. */
export const ACT_TEXTS = {
	notDecided: 'not decided',
	gone: 'gone since the plan',
	deleted: 'deleted',
	waiting: 'waiting for the trash: {trashed}',
	checkedOut: 'checked out in {worktree}',
	leftInTrash: '{reason}: left in the trash, still registered: {trashed}',
} as const

/** How git answers `config --remove-section` for a section that does not exist: nothing to remove. */
export const NO_SUCH_SECTION = 'no such section'
