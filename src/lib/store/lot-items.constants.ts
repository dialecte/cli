/**
 * Why a store lot holds a worktree its root link names when the lot was not among the lots read: its folder is in
 * the store now (made since, or a dangling link) and its records were not read; `{name}` filled.
 */
export const LOT_RECORDS_UNREAD = 'lot {name}: its records do not read'

/**
 * Why `worktree prune` keeps a committed or canceled store lot's item (its worktree, review throwaway or branch): its
 * own, `{lot}` its name and `{state}`; an open lot's item takes the lot keep reason (`LOT_KEEP_REASON`).
 */
export const CLOSED_LOT_ITEM_REASON =
	'lot {lot} {state}: its own item, removed by dialecte lot prune {lot}'
