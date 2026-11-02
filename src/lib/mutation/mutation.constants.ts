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

/** Glob syntax the runner's matcher does not read (it would silently match nothing): braces, classes, extglobs. */
export const UNSUPPORTED_GLOB_SYNTAX = /[{[]|[!?+*@]\(/
