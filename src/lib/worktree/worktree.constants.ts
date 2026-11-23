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

/** The package's own entry in a lock's `packages`: its name, version and ranges, nothing installed. */
export const PACKAGE_LOCK_ROOT_ENTRY = ''

/** Where npm installs packages; a nested package sits in its parent's own one. */
export const NODE_MODULES_PREFIX = 'node_modules/'

/** How many packages that differ from the lockfile the card names; the rest are counted. */
export const NODE_MODULES_PROBLEMS_SHOWN = 5

/** Why `worktree prune` keeps a link, or a folder reached through one. */
export const PRUNE_LINK_REASON = 'a link: prune never removes a link nor what it points to'

/** A worktree whose folder is gone, held because `git worktree prune` would also unregister `{worktrees}`, kept. */
export const GONE_WORKTREE_HELD =
	'deleted from disk; git worktree prune would also unregister {worktrees}, kept for the work it holds'

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

/** The file beside a pooled `node_modules`: `{ repository, lockKey, parkedAt, owner?, packages }`. */
export const POOL_FILE = 'pool.json'

/** The fewest pool entries a repository keeps, whatever its store shows (none: this many). */
export const POOL_ENTRIES_FLOOR = 2

/** The most pool entries a repository keeps, however many of its lots were open at once. */
export const POOL_ENTRIES_CEILING = 8

/** How many pool entries of one lock key a repository keeps: parking one more sends the oldest of that key to the trash. */
export const POOL_ENTRIES_PER_KEY = 2

/**
 * The most packages (by lock key, a version that differs or a key on one side only) a pool entry of the repository may
 * differ from the checkout's lock in to be taken as a near entry, then completed by an incremental install.
 */
export const POOL_DRIFT_LIMIT = 5

/** The environment variable that switches the default npm runner off: `off` answers a failure, nothing spawned. */
export const NPM_INSTALL_SWITCH = 'DIALECTE_NPM_INSTALL'

/** The value of NPM_INSTALL_SWITCH that switches npm off (any other value, or none, runs npm). */
export const NPM_INSTALL_OFF = 'off'

/** What the default npm runner answers with the switch off: the reason a miss records before its copy. */
export const NPM_INSTALL_OFF_ANSWER = {
	status: 1,
	output: 'npm install off (DIALECTE_NPM_INSTALL)',
} as const

/** The incremental install that completes a near pool entry in the checkout, the lock left as it is. */
export const NPM_NEAR_INSTALL_ARGS = ['install', '--prefer-offline', '--no-save'] as const

/** The clean install of a checkout the pool gave nothing (from the local npm cache first). */
export const NPM_CI_ARGS = ['ci', '--prefer-offline'] as const

/** Why npm failed when it printed nothing: its exit status in `{status}`. */
export const NPM_SILENT_FAILURE = 'npm exited {status} with no output'

/** Why a near entry was given up after its install: the check still lists `{count}` packages, the first named. */
export const NEAR_CHECK_FAILURE =
	'{count} package(s) still differ from package-lock.json: {package} {problem}'

/** Why a near entry was given up after its install: its `package-lock.json` read for no packages (`{reason}`). */
export const NEAR_NOT_CHECKED = 'package-lock.json {reason}: not checked'

/** What a near source says after its method: the entry and how many packages it differed in. */
export const NEAR_DETAIL = '{from}, {drift} package(s) differ'

/** What an installed source says after its method when there was no pool to ask. */
export const INSTALLED_DETAIL = 'npm ci'

/** What an installed source says after its method: why the pool gave nothing in `{miss}`. */
export const MISSED_INSTALLED_DETAIL = 'npm ci ({miss})'

/** What a copy says after its method when npm ci failed first: its first line in `{reason}`. */
export const COPY_REASON_DETAIL = 'npm ci failed: {reason}'

/** The checkout's own folder a failed `npm ci`'s `node_modules` is renamed into when there is no pool to trash it in. */
export const CHECKOUT_DISCARD_FOLDER = '.dialecte'

/** The name a failed `npm ci`'s `node_modules` is renamed to, followed by the next free number. */
export const DISCARDED_NODE_MODULES_PREFIX = 'discarded-node_modules-'

/** A restore's miss: the repository has no pool entry. */
export const POOL_MISS_EMPTY = 'pool empty'

/** A restore's miss: entries of the repository, none with the checkout's lock key (followed by its first characters). */
export const POOL_MISS_NO_ENTRY = 'no entry for install'

/** How many characters of the lock key a `no entry for install` miss names. */
export const POOL_MISS_KEY_LENGTH = 8

/** A restore's miss: the matching entries were renamed away by another taker. */
export const POOL_MISS_BUSY = 'entry busy'

/** A restore's miss: the pool is on another file system than the checkout. */
export const POOL_MISS_CROSS_DEVICE = 'cross-device'

/** The caches a park removes from `node_modules`: rebuilt by the tools that wrote them, tied to the old checkout. */
export const POOL_REMOVED_CACHES = ['.vite', '.cache'] as const

/**
 * The folder a park renames the caches into until it is sure: inside a folder already on its way to removal, else in
 * the worktree (then trashed once the park is done, put back when it fails).
 */
export const DISCARDED_CACHES_PREFIX = '.dialecte-discarded-caches-'

/** The folder of `.worktrees/` where worktrees and folders wait for their background removal. */
export const TRASH_FOLDER = '_trash'

/** The trash of a scratch root, where finished rehearsal clones wait for their background removal (named for the cli). */
export const REHEARSAL_TRASH_FOLDER = 'dialecte-trash'

/** What follows a move into a trash `prune` shows: the move is what `--yes` does, the removal comes after it. */
export const TRASH_MOVE_NOTE = '  # then removed in the background'

/** A trash that is a symbolic link: `{trash}`. Nothing is moved into a folder elsewhere. */
export const TRASH_LINK_REFUSAL = '{trash} is a symbolic link: nothing moved into a trash elsewhere'

/** The event older clis wrote in the worktree's lot when tdd moved the hygiene baseline forward (`from`, `to`, full ids): still read. */
export const HYGIENE_BASELINE_MOVED_KIND = 'hygiene.baseline-moved'

/** A check refused on a node_modules that does not install the checked tree's lock (`checkInstallMatchesTree`). */
export const TREE_INSTALL_REFUSALS = {
	/** The lock on disk is the checked one: `npm ci` installs it. */
	mismatch:
		'node_modules does not install the package-lock.json being checked: {package}: {problem}{more}; run {command}',
	/** The checked lock (the staged one) is not the file on disk: `npm ci` would install the other one. */
	otherLock:
		'node_modules does not install the package-lock.json being checked, which differs from the one on disk: {package}: {problem}{more}; put the checked lock on disk (or stage the one on disk), then run {command}',
	/** The checked lock cannot be read package by package: `{reason}` is the reader's. */
	unreadable: 'the package-lock.json being checked {reason}: fix it, then run {command}',
} as const

/** What `syncBaseBranch` says; `{branch}`, `{commit}` filled. */
export const BASE_SYNC_LINES = {
	moved: '{branch} fast-forwarded to origin/{branch} {commit}',
	changes: '{branch} not fast-forwarded: the main checkout holds changes',
	diverged:
		'{branch} not fast-forwarded: it holds commits origin/{branch} does not (the remote is the truth: look)',
	elsewhere: '{branch} not fast-forwarded: checked out in {worktree}',
	failed: '{branch} not fast-forwarded: {reason}',
} as const

/** `worktree prune --reclaim`: the days without git activity (index, HEAD, reflog) after which a worktree is idle, by default. */
export const RECLAIM_OLDER_THAN_DAYS = 2

/** Why `worktree prune --reclaim` leaves a worktree untouched, on its line; `{...}` filled. */
export const RECLAIM_KEEP_REASONS = {
	main: 'the main checkout',
	locked: 'locked (git worktree lock)',
	process: 'a process works in it: pid {pid}',
	activity: 'git activity after the cutoff: {file} at {at}',
	link: 'the link {link} points to it',
	handover: 'hand-over {name} {state} names it',
	nodeModulesLink: 'node_modules is a link: never moved',
	noNodeModules: 'no node_modules',
	missing: 'not on disk',
	noGitFolder: 'its git folder cannot be found: its activity is not known',
	handoverRunning: 'a hand-over runs in it',
	unlisted: 'no longer a worktree of {repository}',
} as const

/** Why `worktree prune --reclaim` sends an idle worktree's node_modules to the trash instead of the pool; `{...}` filled. */
export const RECLAIM_TRASH_REASONS = {
	noLock: 'no package-lock.json: its node_modules installs no lock in use',
	mainNoLock: 'the main checkout has no package-lock.json: no lock in use',
	otherKey: 'lock key {key} is not the main checkout’s {main}',
	notChecked: 'node_modules not checked: {reason}',
	differs: '{count} package(s) differ from package-lock.json: {problems}',
} as const

/**
 * How long a `_pool-*` folder without `pool.json` may stay unwritten and still be a park in progress, in minutes: an
 * older one is a park that never finished, and prune sends it to the trash.
 */
export const POOL_STALE_PARK_MINUTES = 30

/** One minute in milliseconds. */
export const MINUTE_MS = 60 * 1000

/** Why `worktree prune` keeps a `_pool-*` folder without `pool.json` where it is; `{...}` filled. */
export const POOL_LEFT_OVER_KEEP_REASONS = {
	inProgress: 'a park in progress: written at {at}, under {minutes} min ago',
	finished: 'its pool.json is written now: a pool entry',
} as const

/** Why `worktree prune` keeps a rehearsal clone; `{...}` filled. */
export const REHEARSAL_CLONE_TEXTS = {
	noMarker: 'no rehearsal marker: not made by this cli, or still starting',
	running: 'its rehearsal still runs: pid {pid}',
	process: 'a process works in it: pid {pid}',
	link: 'the link {link} points to it',
	unreadable: 'it could not be read ({reason})',
} as const

/**
 * `worktree prune --yes`: the line of a planned removal the decision taken after the confirmation does not let go, one
 * set for every kind; `{...}` filled.
 */
export const PRUNE_AT_MOVE_TEXTS = {
	kept: '✗ {name} kept: {why}',
	gone: '✗ {name}: gone since the plan',
	notOffered: '✗ {name} kept: not offered now',
	anotherWay: '✗ {name} kept: removed another way now: {command}',
	worktreeStays: '✗ {name} kept: its worktree stays',
	wouldUnregister: '✗ {name} kept: git worktree prune would now also unregister {worktrees}',
	notDecided: '✗ {name}: not decided again: {reason}',
} as const

/** Why the processes are not known when the lister throws: every folder is then kept; `{reason}` filled. */
export const PROCESSES_NOT_KNOWN = 'the processes are not known ({reason}): nothing is moved'

/** Why a rehearsal clone stays when its owner cannot be told: two lots own it; `{lots}` filled, `, `-joined. */
export const OWNER_NOT_SINGLE = 'owner not single: {lots}'

/** The git files whose last write is a worktree's activity, in its own git folder: the index, HEAD, its reflog. */
export const RECLAIM_ACTIVITY_FILES = ['index', 'HEAD', 'logs/HEAD'] as const

/** The file `git worktree lock` writes in a worktree's own git folder: the worktree is locked while it is there. */
export const WORKTREE_LOCKED_FILE = 'locked'

/** One day in milliseconds: `--older-than` counts whole days. */
export const RECLAIM_DAY_MS = 24 * 60 * 60 * 1000

/** The size units of a reclaim's total, each 1000 times the one before. */
export const RECLAIM_SIZE_UNITS = ['B', 'kB', 'MB', 'GB'] as const

/** The usage of `worktree prune --reclaim`, named by every refusal of its flags. */
export const RECLAIM_USAGE =
	'dialecte worktree prune [--root <workspace>] --reclaim [--dry-run] [--older-than <days>]'

/** A valid `--older-than`: a positive whole number of days. */
export const RECLAIM_OLDER_THAN_PATTERN = /^[1-9]\d*$/

/** What a reclaim says of a worktree whose node_modules went between its plan and its move (another reclaim). */
export const RECLAIM_GONE = 'node_modules gone already (moved by another reclaim): nothing done'

/** A scratch folder whose process is gone goes to the trash once it is older than this (a day). */
export const SCRATCH_PRUNE_AGE_MS = 86_400_000

/** Why `worktree prune` keeps a folder of the scratch root; `{pid}` and `{age}` are filled. */
export const SCRATCH_KEEP_REASONS = {
	noMarker: 'no scratch.json: not made by this cli, or still starting',
	live: 'its process still runs: pid {pid}',
	young: 'made {age} ago: kept for a day',
} as const

/** The time a trashed folder's name ends with (`<name>-yyyymmddThhmmss`, maybe `-<n>` after it). */
export const TRASH_TIME_PATTERN = /-(\d{8}T\d{6})(?:-\d+)?$/
