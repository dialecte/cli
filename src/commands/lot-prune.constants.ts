/** The usage line of `lot prune`. */
export const LOT_PRUNE_USAGE =
	'usage: dialecte lot prune [<id>...] [--feature <name>] [--all] [--yes] [--json] (ids, --feature and --all exclude each other)'

/** `lot prune`'s own lines; `{...}` filled. */
export const LOT_PRUNE_TEXTS = {
	unknown: 'lot prune: {names} named no single lot: nothing done',
	simulated: 'simulated: never removed',
	refused: 'refused trash deletion: {worktree}',
	leftInTrash: 'left in the trash by its proof: {worktree}: {reason}',
	clean: 'clean',
	none: 'no lot to prune',
} as const

/** How long git's background removal of a trashed worktree may take before it reads as refused: ten minutes. */
export const REFUSED_TRASH_AGE_MS = 10 * 60 * 1000
