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

/** The line `worktree add` writes to the repository's exclude file: the lot declaration's folder. */
export const LOT_FOLDER_EXCLUDE = '.dialecte/'

/** The lot declaration as a path relative to a repository or a package root. */
export const LOT_FILE_PATTERN = /(^|\/)\.dialecte\/lot\.json$/

/** The sections of a package.json naming dependencies. */
export const DEPENDENCY_SECTIONS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
] as const

/** A dependency installed from a folder (`file:../core`, `link:../core`): its path. */
export const LOCAL_DEPENDENCY_PATTERN = /^(?:file|link):(.+)$/

/** The lockfile `worktree add` reads `node_modules` against. */
export const PACKAGE_LOCK_FILE = 'package-lock.json'

/** Where npm installs packages; a nested package sits in its parent's own one. */
export const NODE_MODULES_PREFIX = 'node_modules/'

/** How many packages that differ from the lockfile the card names; the rest are counted. */
export const NODE_MODULES_PROBLEMS_SHOWN = 5

/** Why `worktree prune` keeps a link, or a folder reached through one. */
export const PRUNE_LINK_REASON = 'a link: prune never removes a link nor what it points to'
