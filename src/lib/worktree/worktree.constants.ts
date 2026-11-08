/** The baseline `worktree add` writes in the worktree's git folder. */
export const HYGIENE_BASELINE_FILE = 'dialecte-hygiene.json'

/** The branch a package's work is merged into, unless its package.json says otherwise. */
export const DEFAULT_BASE_BRANCH = 'main'

/** `worktree add <repository>` whose path is no folder (the repository named from inside itself), or in no git repository. */
export const REPOSITORY_NO_FOLDER = '{path} is no folder: name the repository from where you stand'
export const REPOSITORY_NO_GIT = '{path} is in no git repository'

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

/** Before a mutation run's line when the run keeps the worktree it was started from. */
export const PRUNE_RUN_PREFIX = 'mutation '

/** The folder of `.worktrees/` holding one empty claim file per index ever taken, named by the index. */
export const WORKTREE_INDEX_FOLDER = '.index'

/** How many digits an index has at least: `0007`; past 9999 it grows (`10000`). */
export const WORKTREE_INDEX_DIGITS = 4

/** A numbered worktree folder's name: its index, then `-` (`0171-cli-x`). */
export const WORKTREE_INDEX_PATTERN = /^(\d{4,})-/

/** A claim's name in `.index/`: the index alone. */
export const WORKTREE_INDEX_CLAIM_PATTERN = /^\d{4,}$/

/**
 * `git status` as prune and `lot close` read a worktree: never rewriting its index, untracked files listed
 * whatever `status.showUntrackedFiles` says (with `no`, an untracked file would read as clean, and git refuses
 * `--ignored=matching`).
 */
export const WORKTREE_STATUS_ARGUMENTS = [
	'--no-optional-locks',
	'status',
	'--porcelain',
	'--untracked-files=normal',
] as const

/** How long `lot close` waits for the list of processes and their working folders before it keeps everything. */
export const PROCESS_LIST_TIMEOUT_MS = 20_000

/** A pool entry's folder in `.worktrees/`: `_pool-<repository>-<n>`. */
export const POOL_FOLDER_PREFIX = '_pool-'

/** A pool entry's name: its repository, then its number. */
export const POOL_ENTRY_PATTERN = /^_pool-(.+)-(\d+)$/

/** The file beside a pooled `node_modules`: `{ repository, lockHash, parkedAt }`. */
export const POOL_FILE = 'pool.json'

/** How many pool entries a repository keeps: parking one more sends the oldest to the trash. */
export const POOL_ENTRIES_PER_REPOSITORY = 2

/** The caches a park removes from `node_modules`: rebuilt by the tools that wrote them, tied to the old checkout. */
export const POOL_REMOVED_CACHES = ['.vite', '.cache'] as const

/** The folder a park renames the caches into, inside a folder already on its way to removal. */
export const DISCARDED_CACHES_PREFIX = '.dialecte-discarded-caches-'

/** The folder of `.worktrees/` where worktrees and folders wait for their background removal. */
export const TRASH_FOLDER = '_trash'
