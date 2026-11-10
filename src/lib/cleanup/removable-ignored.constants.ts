/**
 * `git status` as `removableIgnored` reads a worktree: never rewriting its index, NUL-separated entries (a path
 * with a space, a quote or a non-ASCII character as it is), every untracked file, and the ignored entries as git
 * matches them (a folder holding no tracked file printed once, with its trailing `/`).
 */
export const IGNORED_STATUS_ARGUMENTS = [
	'--no-optional-locks',
	'status',
	'-z',
	'--porcelain',
	'--untracked-files=all',
	'--ignored=matching',
] as const

/** Before the path of an ignored entry in git's porcelain status. */
export const IGNORED_ENTRY_PREFIX = '!! '

/** The status letters of an entry git follows with its original path, as one more NUL-separated field. */
export const STATUS_WITH_ORIGINAL_PATH = ['R', 'C'] as const
