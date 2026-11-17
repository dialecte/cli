import type { ForecastVerdict } from './forecast.types.ts'

/** The version of a `forecast.jsonl` line. */
export const FORECAST_SCHEMA = 1

/** How long one git step of the forecast may run before the comparison reads unknown (decision Q7: 20 s). */
export const FORECAST_STEP_LIMIT_MS = 20_000

/** The lowest git whose merge-tree has `--write-tree`. */
export const FORECAST_MIN_GIT: readonly [number, number] = [2, 38]

/** The most bytes one line of `forecast.jsonl` may hold (the store's atomic append). */
export const FORECAST_LINE_LIMIT = 4_096

/** The most shared paths, conflict paths and ranges per path one line holds; the rest is counted. */
export const FORECAST_SHARED_CAP = 10
export const FORECAST_CONFLICT_CAP = 10
export const FORECAST_RANGE_CAP = 3

/** The verdicts from best to worst: a lot's verdict is the worst of its comparisons. */
export const FORECAST_VERDICT_ORDER: readonly ForecastVerdict[] = [
	'clean',
	'exclusive',
	'conflict',
	'unknown',
]

/** The exit of `lot forecast` per verdict. */
export const FORECAST_EXIT_CODES: Readonly<Record<ForecastVerdict, number>> = {
	clean: 0,
	exclusive: 1,
	conflict: 1,
	unknown: 3,
}

/** The exclusive paths (decision Q2): the lock files, by file name, fixed in the cli. */
export const EXCLUSIVE_FILE_NAMES: ReadonlySet<string> = new Set([
	'package-lock.json',
	'npm-shrinkwrap.json',
	'pnpm-lock.yaml',
	'yarn.lock',
	'bun.lock',
	'bun.lockb',
	'uv.lock',
])

/** The `against` of the comparison with main. */
export const AGAINST_MAIN = 'main'

/** The keys a line must hold, and the keys it may hold; any other key makes it unreadable. */
export const FORECAST_REQUIRED_KEYS: readonly string[] = [
	'schema',
	'run',
	'at',
	'trigger',
	'of',
	'self',
	'main',
	'against',
	'verdict',
]
export const FORECAST_OPTIONAL_KEYS: readonly string[] = [
	'other',
	'shared',
	'conflicts',
	'more',
	'moreShared',
	'reason',
]

/** The triggers a line may name. */
export const FORECAST_TRIGGERS: readonly string[] = ['start', 'scope', 'gate', 'forecast', 'land']

/** The identity and date of a snapshot commit: fixed, so the snapshot sha is a function of its tree and parent. */
export const SNAPSHOT_ENVIRONMENT = {
	GIT_AUTHOR_NAME: 'dialecte forecast',
	GIT_AUTHOR_EMAIL: 'forecast@dialecte.invalid',
	GIT_AUTHOR_DATE: '1970-01-01T00:00:00Z',
	GIT_COMMITTER_NAME: 'dialecte forecast',
	GIT_COMMITTER_EMAIL: 'forecast@dialecte.invalid',
	GIT_COMMITTER_DATE: '1970-01-01T00:00:00Z',
} as const

/** The message of a snapshot commit. */
export const SNAPSHOT_MESSAGE = 'forecast snapshot'

/** The prefix of the scratch folder holding the copy of a worktree's index. */
export const SNAPSHOT_FOLDER_PREFIX = 'dialecte-forecast-'

/** The conflict markers whose lines bound a content conflict's range. */
export const CONFLICT_START_MARKER = '<<<<<<< '
export const CONFLICT_END_MARKER = '>>>>>>> '

/** The type merge-tree gives a content conflict, and the kind the forecast names it. */
export const CONTENT_CONFLICT_TYPE = 'contents'
export const CONTENT_CONFLICT_KIND = 'content'

/** A merge-tree message type that names a conflict: `CONFLICT (<kind>)`. */
export const CONFLICT_TYPE_PATTERN = /^CONFLICT \((?<kind>[^)]+)\)$/

/** The version line of `git --version`. */
export const GIT_VERSION_PATTERN = /^git version (?<version>(?<major>\d+)\.(?<minor>\d+)\S*)/

/** The reasons of an unknown comparison (spec 4.5). */
export const FORECAST_REASONS = {
	gitVersion: 'git {version} has no merge-tree --write-tree (2.38 or later)',
	damaged: '{lot} damaged: {damage}',
	worktreeMissing: 'worktree of {lot} missing',
	noRef: '{ref} does not resolve',
	snapshotFailed: 'snapshot of {lot} failed: {message}',
	mergeTreeFailed: 'merge-tree failed: {message}',
	diffFailed: 'diff failed: {message}',
	overTime: 'forecast of {lot} over {seconds} s',
} as const

/** The kind of the event a forecast run writes into the lot's events. */
export const FORECAST_EVENT_KIND = 'forecast'

/** What a merge-tree output that does not parse is reported as. */
export const MERGE_TREE_UNPARSED = 'its output does not parse'

/** A tree id as merge-tree writes it first. */
export const TREE_ID_PATTERN = /^[0-9a-f]{40,64}$/

/** Why a lot has no forecast (`forecastLot`'s refusal): damaged, or not open. */
export const FORECAST_REFUSALS = {
	damaged: '{lot} damaged: {damage}',
	notOpen: '{lot} is {state}: only an open lot has a forecast',
} as const

/** The state word of a simulated lot in the refusal: a simulated lot has no work to forecast. */
export const FORECAST_SIMULATED_WORD = 'simulated'

/** The lines recording a run prints when a write fails. */
export const FORECAST_RECORD_TEXTS = {
	writeFailure: '{file} not written: {message}',
	eventFailure: '! forecast event not written to {file}: {message}',
} as const

/** The slashes that end a folder entry, left out when an entry's file name is read. */
export const TRAILING_SLASHES = /\/+$/u

/** One conflict as text (`<path>:<ranges> (<kind>)`, `<path> (<kind>)` without lines), joined by `; `. */
export const FORECAST_CONFLICT_TEXTS = {
	withLines: '{path}:{ranges} ({kind})',
	withoutLines: '{path} ({kind})',
	more: '{count} more',
} as const
export const FORECAST_CONFLICT_SEPARATOR = '; '
export const FORECAST_RANGE_SEPARATOR = ', '

/** What holds a pair the forecast does not clear, as the verbs that wait on it say it. */
export const FORECAST_HOLD_TEXTS = {
	conflict: 'forecast conflict: {conflicts}',
	exclusive: 'exclusive: a lock file is never shared',
	unknown: 'forecast unknown: {reason}',
} as const

/** The lines the gate prints of its forecast: the verdict, then each comparison it does not clear. */
export const GATE_FORECAST_TEXTS = {
	verdict: 'forecast: {verdict}',
	held: '! {against}: {hold}',
	failed: '! the forecast could not run: {reason}',
} as const

/** The age of a stored forecast as a reader shows it (a stale result never counts as clean: its age is said). */
export const FORECAST_AGE_TEXTS = {
	minutes: '{count} min ago',
	hours: '{count} h ago',
	days: '{count} d ago',
} as const
export const MINUTE_MS = 60_000
export const MINUTES_PER_HOUR = 60
export const HOURS_PER_DAY = 24
