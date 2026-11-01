/** The machine-wide lock heavy runs take, in the user's cache folder. */
export const MACHINE_LOCK_FILE = 'heavy-run.lock'

/**
 * The environment variable naming the process that holds the machine lock for a command, as
 * `<pid>:<process start>` (`lock run` sets it for the command it runs): a lock that live process holds is
 * already this process's own.
 */
export const MACHINE_LOCK_HOLDER_VARIABLE = 'DIALECTE_MACHINE_LOCK_HOLDER'

/** What a caller reports while the lock file exists but holds no holder yet. */
export const BEING_WRITTEN_HOLDER = {
	pid: 0,
	command: '(the lock file is being written)',
	startedAt: '-',
} as const

/** How often a waiting caller looks at the lock again. */
export const MACHINE_LOCK_POLL_MILLISECONDS = 1000

/**
 * A gate step runs a browser project unless it says otherwise (`"heavy"`): vitest's browser mode or
 * project, playwright.
 */
export const BROWSER_COMMAND_PATTERN = /--browser\b|--project[= ]['"]?[\w-]*browser|\bplaywright\b/

/** A step that runs a test runner: in a package whose tests run in a browser, it starts one. */
export const TEST_RUNNER_PATTERN = /\bvitest\b|\bplaywright\b/

/** Dependencies that run tests in a browser. */
export const BROWSER_TEST_DEPENDENCY_PATTERN = /^(@vitest\/browser|playwright$|@playwright\/test$)/

/** Config files a browser test project is declared in. */
export const TEST_CONFIG_FILES = [
	'vitest.config.ts',
	'vitest.config.mts',
	'vitest.config.js',
	'vitest.config.mjs',
	'vitest.workspace.ts',
	'vite.config.ts',
	'vite.config.mts',
	'vite.config.js',
	'vite.config.mjs',
] as const

/** A `browser:` option in a test config: a browser project or browser mode. */
export const BROWSER_CONFIG_PATTERN = /\bbrowser\s*:/

/** The short lock a caller holds while it takes over a stale lock: `<lock>.takeover`. */
export const TAKEOVER_SUFFIX = '.takeover'

/**
 * A lock file that stays unreadable, or a takeover lock, this old was left by a caller that died: a
 * writer finishes its link at once, a takeover in milliseconds.
 */
export const STALE_FILE_MILLISECONDS = 5000
