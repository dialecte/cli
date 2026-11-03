export const MUTATION_RECORDS_PATH = '.dialecte/mutation-records.json'
export const LEGACY_RECORDS_PATH = 'scripts/mutants/equivalent-mutants.json'

export const MUTATION_FAMILIES = [
	'invariant-guard',
	'fallback-never-taken',
	'exhaustive-default',
	'no-op-on-empty',
	'perf-shortcut',
	'static-init',
	'schema-default-read',
	'wording',
	'unclassified',
] as const

/** The families whose records carry `removable`. */
export const REMOVABLE_FAMILIES = ['invariant-guard', 'fallback-never-taken'] as const

export const MUTATION_DECLARATION_KEYS = [
	'scope',
	'exclude',
	'errorFactories',
	'fast',
	'full',
] as const

/** Files never mutated, whatever the scope says. */
export const NEVER_MUTABLE =
	/(?:\.test|\.types|\.d|\.generated|\.setup)\.ts$|(?:^|\/)(?:fixtures|__tests__)\//

export const SURVIVING_STATUSES: ReadonlySet<string> = new Set(['Survived', 'NoCoverage'])
export const TIMEOUT_STATUS = 'Timeout'
export const KILLED_STATUS = 'Killed'

export const MUTATE_TARGET = /^(.*?)(?::(\d+)(?::(\d+))?-(\d+)(?::(\d+))?)?$/
export const DIFF_HUNK = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/
export const DIFF_NEW_PATH = '+++ b/'

export const IGNORER_ERROR_TEXT = 'dialecte-error-text'
export const IGNORER_EXHAUSTIVE_DEFAULT = 'dialecte-exhaustive-default'
export const STRYKER_VITEST_RUNNER_PLUGIN = '@stryker-mutator/vitest-runner'

/** The per-mutant time limit of each tier, in milliseconds. */
export const TIER_TIMEOUT_MS = { fast: 10_000, timeouts: 60_000, full: 30_000 } as const

/** Tiers that run on one worker whatever the caller asks for. */
export const SINGLE_WORKER_TIERS: readonly string[] = ['timeouts', 'full']

export const IGNORER_NAMES: readonly string[] = [IGNORER_ERROR_TEXT, IGNORER_EXHAUSTIVE_DEFAULT]

/** Names of the error classes the error-text ignorer reads as an error construction (`new ParseError(...)`). */
export const ERROR_CLASS_NAME = /Error$/

/** Property names whose value, inside an error construction, is wording. */
export const ERROR_WORDING_PROPERTIES: ReadonlySet<string> = new Set([
	'detail',
	'message',
	'reason',
])

/** The call that marks a `default:` arm as exhaustive (besides `satisfies never`). */
export const ASSERT_NEVER_NAME = 'assertNever'

export const ERROR_TEXT_REASON = 'error wording: no output depends on the text of an error'
export const EXHAUSTIVE_DEFAULT_REASON =
	'exhaustive default: the arm is unreachable while the switch covers every case'

export const MUTATION_FAST_KEYS = ['vitestConfig'] as const
export const MUTATION_FULL_KEYS = ['command'] as const

/** The reporters of every run: the json report is the one the judge reads. */
export const STRYKER_REPORTERS = ['progress', 'json']

/** Folders Stryker leaves out of the sandbox copy. */
export const STRYKER_IGNORE_PATTERNS = ['.tmp', 'dist', 'doc', '.vitepress']

/** The only source extension the runner mutates: Stryker aborts on a file it cannot parse. */
export const MUTABLE_EXTENSION = /\.ts$/

/** The JSON schema of the `dialecteMutation` option, so Stryker does not warn about an unknown option. */
export const STRYKER_VALIDATION_SCHEMA = {
	properties: {
		dialecteMutation: {
			type: 'object',
			additionalProperties: false,
			properties: { errorFactories: { type: 'array', items: { type: 'string' } } },
		},
	},
} as const

/**
 * Glob syntax a scope or exclude glob may not use: braces, classes and extglobs. The runner's matcher would read `[`
 * and `{` as literal characters and match nothing the author meant, so they are refused rather than matched
 * literally; a declared dialecte's paths hold no bracket or brace.
 */
export const UNSUPPORTED_GLOB_SYNTAX = /[{[]|[!?+*@]\(/

/** The values `.dialecte/lot.json` `mutation` takes. */
export const MUTATION_MODES = ['off', 'changed', 'audit', 'gate'] as const

/** The runs `dialecte mutants run` can be asked for. */
export const RUN_MODES = ['changed', 'audit'] as const

/** The store, in the git folder every worktree of a repository shares. */
export const MUTATION_STORE_FOLDER = 'dialecte-mutation'
export const MUTATION_RUNS_FOLDER = 'runs'
export const MUTATION_LEDGER_FILE = 'ledger.json'

export const NOTHING_TO_MUTATE = 'nothing to mutate'

/** What `run` prints when the lot's switch, or a lot touching no scope file, leaves mutation off. */
export const MUTATION_OFF = 'mutation off for this lot'

/** Where a run's reports and Stryker's sandboxes go, package-relative (a folder Stryker leaves out of its copy). */
export const MUTANTS_WORK_FOLDER = '.tmp/mutants'

/** The ignorer plugin's file name in the cli's build output. */
export const IGNORER_PLUGIN_FILE = 'ignorers.js'

/** The folder the cli's build writes into, beside its package.json. */
export const CLI_DIST_FOLDER = 'dist'

/** The separator of a ledger key: `<package>::<survivor key>`. */
export const LEDGER_KEY_SEPARATOR = '::'

/** The length a tree id is shortened to in what `run` and `status` print. */
export const SHORT_TREE_LENGTH = 12

export const MUTANTS_VERBS = [
	'run',
	'status',
	'schedule',
	'abandon',
	'migrate',
	'judge',
	'record',
	'drop',
] as const

export const MUTANTS_USAGE = `usage: dialecte mutants run [--mode changed|audit] [--base <ref>]
       dialecte mutants status [--json]
       dialecte mutants schedule <follow-up> <survivor key>... | schedule <follow-up> --all-new [--json]
       dialecte mutants abandon <run id> [--json]
       dialecte mutants migrate [--json]
       dialecte mutants judge [--file <file>] [--json]
       dialecte mutants record (--key <survivor key>... | --file <file>) --family <family> --reason <text> [--removable] [--json]
       dialecte mutants drop <run id> [--json]`

/** The lock every ledger reader and writer holds while it folds runs in or writes, beside the ledger. */
export const MUTATION_LEDGER_LOCK_FILE = 'ledger.lock'

/** The ids of the reported runs the ledger has taken in, beside the ledger. */
export const MUTATION_APPLIED_RUNS_FILE = 'applied-runs.json'

/** How long a ledger reader or writer waits for the lock held by a live process before it gives up. */
export const LEDGER_LOCK_TIMEOUT_MS = 30_000

/** How old a lock naming no owner must be to be stale: far longer than its creator needs to write its owner in. */
export const LEDGER_LOCK_ORPHAN_MS = 5_000

/** How long it sleeps between two tries of the lock. */
export const LEDGER_LOCK_RETRY_MS = 10

/** The config file every Stryker call names, holding `{}`, in the run's work folder: no config of the package is merged in. */
export const EMPTY_STRYKER_CONFIG_FILE = 'stryker.empty.config.json'

/** The remote's default branch, as a clone records it: a changed run's base when the package's base branch is missing. */
export const REMOTE_DEFAULT_BRANCH = 'refs/remotes/origin/HEAD'
