/** The baseline `worktree add` writes in the worktree's git folder. */
export const HYGIENE_BASELINE_FILE = 'dialecte-hygiene.json'

/** The branch a package's work is merged into, unless its package.json says otherwise. */
export const DEFAULT_BASE_BRANCH = 'main'

/** Ignored folders a worktree may lose: rebuilt by an install, a build or a docs build. */
export const REBUILT_IGNORED_FOLDERS = [
	'node_modules/',
	'dist/',
	'.vitepress/cache/',
	'.vitepress/dist/',
] as const

/** Ignored files a worktree may lose wherever they are: written by the system. */
export const REBUILT_IGNORED_NAMES = ['.DS_Store'] as const

/** How many ignored files a kept worktree's reason names; the rest are counted. */
export const IGNORED_FILES_SHOWN = 3

/** A stash entry's subject names the branch it was pushed on: `WIP on <branch>: …` or `On <branch>: …`. */
export const STASH_SUBJECT_PATTERN = /^(?:WIP on|On) (.+?): /

/**
 * The lot declaration the orchestrator writes at the package root (`.dialecte/lot.json`); never committed,
 * never in a lot, wherever the package sits in its repository.
 */
export const LOT_FILE = '.dialecte/lot.json'

/** The lot declaration as a path relative to a repository or a package root. */
export const LOT_FILE_PATTERN = /(^|\/)\.dialecte\/lot\.json$/
