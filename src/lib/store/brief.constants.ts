import type { BriefEffort } from './brief.types.ts'

/** The keys a brief of schema 1 may hold; any other is refused (a misspelt `scopes` must not pass as no scope). */
export const BRIEF_KEYS: readonly string[] = [
	'schema',
	'feature',
	'repository',
	'branch',
	'base',
	'goal',
	'plan',
	'scope',
	'steps',
	'lots',
	'effort',
	'summary',
	'issue',
]

/** The one schema a brief may name. */
export const BRIEF_SCHEMA = 1

/** A feature name: lower-case letters, digits and dashes, not starting with a dash. */
export const FEATURE_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** The longest feature name. */
export const FEATURE_MAX_LENGTH = 60

/** The longest goal. */
export const GOAL_MAX_LENGTH = 200

/** The longest summary: one sentence a pull request shows. */
export const SUMMARY_MAX_LENGTH = 200

/** The detail of a summary holding a path or a link. */
export const SUMMARY_PATH_DETAIL = 'summary holds a path or a link'

/** The detail of a public text holding a reference: `{field}` it, `{label}` the rule's label, never the text. */
export const PUBLIC_TEXT_DETAIL = '{field} holds a {label}'

/** The detail of a summary not checked because the machine's lists cannot be read: `{reason}` why. */
export const PUBLIC_TEXT_UNCHECKED_DETAIL = '{field} not checked: {reason}'

/** The detail of an issue that is not a positive integer. */
export const ISSUE_DETAIL = 'issue must be a positive integer'

/** The fewest and the most behaviours of a step. */
export const BEHAVIOURS_MIN = 1
export const BEHAVIOURS_MAX = 6

/** What separates a behaviour's case from its outcome, exactly once. */
export const BEHAVIOUR_ARROW = ' -> '

/** The efforts a brief may ask for. */
export const BRIEF_EFFORTS: readonly BriefEffort[] = ['low', 'medium', 'high']

/** A line break: a field that must hold one line holds none. */
export const LINE_BREAK_PATTERN = /[\r\n]/

/** The first glob character of a scope entry: its literal part is everything before it. */
export const GLOB_CHARACTER_PATTERN = /[*?[{(!]/

/** The path separator of a scope entry, and the segments it never holds. */
export const SCOPE_SEPARATOR = '/'
export const CURRENT_SEGMENT = '.'
export const PARENT_SEGMENT = '..'

/** The trailing separators a normalised entry drops. */
export const TRAILING_SEPARATORS = /\/+$/

/** The first segments a scope entry may not start with: the git folder and the cli's own folder. */
export const FORBIDDEN_FIRST_SEGMENTS: readonly string[] = ['.git', '.dialecte']

/** The glob that names every file: a scope of it is no scope. */
export const EVERY_FILE_GLOB = '**'

/** A markdown heading line: a step's `spec` is one of the plan's, exactly. */
export const HEADING_LINE_PATTERN = /^#{1,6} \S/

/** A line of the plan. */
export const PLAN_LINE_SEPARATOR = /\r?\n/

/** Names `git check-ref-format --branch` lets through that are no branch (`@` is git's shorthand for HEAD). */
export const REFUSED_BRANCH_NAMES: readonly string[] = ['@']

/** The field of a refusal about the brief file as a whole (it does not parse, or is no object). */
export const WHOLE_BRIEF_FIELD = 'brief'

/** The digest of the brief and plan hashes. */
export const BRIEF_HASH_ALGORITHM = 'sha256'

/** After the met pairs of an overlap a start still refuses: what holds it (a met lock file, a forecast that cannot run). */
export const OVERLAP_HOLD_NOTE = ' ({hold})'

/** How long a published lot with no worktree yet reads as still starting (no work, never a hold; 33CO 4.7, Q5). */
export const START_WINDOW_MS = 10 * 60_000

/** The kind of the event that ends a recorded step. */
export const STEP_END_KIND = 'step.end'
