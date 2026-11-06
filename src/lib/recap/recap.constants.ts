/** The fixed wording of `dialecte lot recap`: its sections, its sentences, its usage. */
import type { CaseStatus } from '../tdd/tdd.types.ts'
import type { FindingOutcome } from './recap.types.ts'

export const RECAP_USAGE = 'lot recap: expected <hand-over folder>'

export const RECAP_OPEN = ['<details>', '<summary>How this change was made</summary>'] as const

export const RECAP_CLOSE = '</details>'

export const SECTION_TITLES = {
	commits: '### Commits',
	tests: '### Tests added',
	checks: '### Checks',
	mutation: '### Mutation',
	review: '### Review',
	decisions: '### Decisions',
	followUps: '### Follow-ups',
} as const

/** The one line of each section when it has nothing to say. */
export const EMPTY_SECTION = {
	tests: 'No test case added.',
	checks: 'No check recorded.',
	mutation: 'No mutation run.',
	review: 'No review recorded.',
	decisions: 'No decision recorded.',
	followUps: 'No follow-up.',
} as const

export const NOT_COMMITTED = 'not committed yet:'

/** The sentence over the tests added: `{cases}` is `<n> case(s)`. */
export const TESTS_ADDED_LINE = '{cases} failed before the code changed, then passed:'

/** The other statuses the gate judged, in the order they are counted. */
export const OTHER_JUDGED_STATUSES: readonly CaseStatus[] = [
	'unchanged',
	'accepted',
	'revised',
	'red',
	'missing receipt',
	'test edited after red',
]

export const ALSO_JUDGED = 'Also judged:'

/** The outcomes of the findings, in the order the totals line counts them. */
export const FINDING_OUTCOMES: readonly FindingOutcome[] = ['fixed', 'accepted', 'logged', 'open']

/**
 * The state words a ledger state starts with, and the outcome each gives. A state is a history of segments
 * joined by ` - ` (`fix wrong 2 (...) - fixed 3 (reasoned)`): its first segment starts with one of these
 * words, each later one with a transition (`STATE_TRANSITIONS`); the last segment decides.
 */
export const STATE_WORDS: ReadonlyArray<{ word: string; outcome: FindingOutcome }> = [
	{ word: 'fixed', outcome: 'fixed' },
	{ word: 'accepted', outcome: 'accepted' },
	{ word: 'logged', outcome: 'logged' },
	{ word: 'open', outcome: 'open' },
	{ word: 'fix to verify', outcome: 'open' },
	{ word: 'fix-to-verify', outcome: 'open' },
	{ word: 'fix wrong', outcome: 'open' },
	{ word: 'reopened', outcome: 'open' },
]

/**
 * What a ` - ` must be followed by to start a new segment of a state's history: `fixed <n>`, `reopened <n> by
 * <id>`, `fix wrong <n>`, `fix to verify` (each at the end, or before ` - ` or ` (`), `open` at the end,
 * `accepted` or `logged` before ` (`, ` - ` or `: ` (a later decision). Any other ` - ` is part of the text
 * before it (a reason, a blast radius, where a finding was logged).
 */
export const STATE_TRANSITIONS: ReadonlyArray<{ pattern: RegExp; outcome: FindingOutcome }> = [
	{ pattern: /^fixed \d+(?= - | \(|$)/, outcome: 'fixed' },
	{ pattern: /^reopened \d+ by [^\s()]+(?= - | \(|$)/, outcome: 'open' },
	{ pattern: /^fix wrong \d+(?= - | \(|$)/, outcome: 'open' },
	{ pattern: /^(?:fix to verify|fix-to-verify)(?= - | \(|$)/, outcome: 'open' },
	{ pattern: /^open$/, outcome: 'open' },
	{ pattern: /^accepted(?= \(| - |: )/, outcome: 'accepted' },
	{ pattern: /^logged(?= \(| - |: )/, outcome: 'logged' },
]

/** The state word whose rest is the reason of an accepted finding. */
export const ACCEPTED_WORD = 'accepted'

/** The separator of the segments of a ledger state's history. */
export const STATE_SEGMENT_SEPARATOR = ' - '

/** What comes between `accepted` and its reason when the reason has no parentheses: `- ` or `: `. */
export const REASON_LEAD_PATTERN = /^\s*(?:[-:]\s*)?/

/** A reason in parentheses: the text inside the outer ones. */
export const PARENTHESISED_REASON_PATTERN = /^\((.*)\)$/s

/** The round an id names when its round cell holds none: `R<round>-...` as `lot finding` writes it. */
export const ROUND_FROM_ID_PATTERN = /^R(\d+)-/

/**
 * One leading reviewer tag of a finding's text and the spaces after it: `[`, a letter then a digit or a text
 * holding a comma, `]` (`[M1, hook] `, `[F4, outside the repository] `); `[] returned` or `[object Object]`
 * is no tag.
 */
export const REVIEWER_TAG_PATTERN = /^\[[A-Za-z](?:\d[^\]]*|[^\],]*,[^\]]*)\]\s+/

/** An absolute path in a `file:line` cell, with what precedes it. */
export const ABSOLUTE_PATH_PATTERN = /(^|[\s,;(])(\/[^\s,;()]+)/g

/** A URL in a `file:line` cell (`scheme://...`): never read as a path. */
export const URL_PATTERN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/\S*/g

/**
 * An absolute path left in a `file:line` cell after the rewrite: a `/` (or `~/`) directly followed by a
 * path-segment character (letter, digit, `_`, `.`) and preceded by no path character - after a backtick, a
 * quote, `=`, `[`, `-`, a space or at the start; `a.ts / b.ts`, `+/- 2` and `12-/` hold none.
 */
export const LEFTOVER_ABSOLUTE_PATH_PATTERN = /(?:^|[^\p{L}\p{N}_./])\/[\p{L}\p{N}_.]/u

/** The refusal of a row whose round cell holds no round and whose id names none: `{id}`. */
export const NO_ROUND = '{id} has no round: write its round cell'

/** The refusal of a state whose first segment starts with no state word: `{id}`, `{state}`. */
export const UNREADABLE_STATE =
	'{id} has a state recap cannot read: "{state}"; set it with dialecte lot decide'

/** The refusal of a `file:line` cell pointing outside the workspace folder: `{id}`. */
export const OUTSIDE_WORKSPACE =
	'{id} points outside the workspace: write --at relative to its repository'

/** The line under the lots when the branch does not hold the lots on top of the recorded HEAD. */
export const BRANCH_REWRITTEN =
	'The branch does not hold these lots on top of the recorded base: none is listed.'

/** The severities a round counts, in order, each with whether its noun takes a plural. */
export const ROUND_SEVERITIES: ReadonlyArray<{ severity: string; plural: boolean }> = [
	{ severity: 'blocking', plural: false },
	{ severity: 'should fix', plural: false },
	{ severity: 'nit', plural: true },
]

/** Who made the decisions the ledger and the lot declaration hold. */
export const ASSISTANT = 'the assistant'

/** The wording of each kind of decision before its subject. */
export const DECISION_PREFIXES = {
	kept: 'Kept as is:',
	accepted: 'Accepted without a failing run:',
	revised: 'Test changed after its failing run:',
} as const

/** The closing sentence: `{user}` is the git user name. */
export const PREPARED_BY = 'Prepared with an AI assistant, reviewed and posted by {user}.'

/** The lot declaration `handover run` moves into the hand-over folder. */
export const FOLDER_LOT_FILE = 'lot.json'

/** The refusal when no git user name is set. */
export const NO_USER_NAME =
	'no git user name in {where}: set it with `git config user.name "<your name>"`'

/** The Mutation section of a package that declares no mutation scope. */
export const NO_MUTATION_SCOPE_DECLARED = 'No mutation scope declared.'

/** A reported run in the Mutation section: its mode, its id, its counts. */
export const RECAP_REPORTED_RUN =
	'- {mode} run `{id}`: {killed} killed · {survived} survived · {timedOut} timed out · {noCoverage} no coverage'

/** A run in any other state: `running`, `died`, `abandoned`. */
export const RECAP_OTHER_RUN = '- {mode} run `{id}`: {state}'

/** A survivor a run of the lot killed or recorded. */
export const RECAP_MOVED_ITEM = '- `{file}:{line}` {mutation}: {state} by `{id}`'

/** A survivor of the lot left for a follow-up. */
export const RECAP_SCHEDULED_ITEM = '- `{file}:{line}` {mutation}: scheduled for {followUp}'
