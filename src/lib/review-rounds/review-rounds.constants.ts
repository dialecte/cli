/** The names, spellings and usages of a lot's review rounds: the findings ledger, the snapshots, the fix diff. */

/** The findings ledger's file name in the hand-over folder. */
export const LEDGER_FILE = 'findings-ledger.md'

/** The ledger table's header row and separator, each followed by a line feed. */
export const LEDGER_TABLE_HEAD =
	'| id | round | severity | file:line | finding | state |\n|---|---|---|---|---|---|\n'

/** The severities `lot finding` accepts, each with how it is written in the ledger. */
export const SEVERITY_SPELLINGS: Readonly<Record<string, string>> = {
	blocking: 'blocking',
	'should-fix': 'should fix',
	'should fix': 'should fix',
	nit: 'nit',
}

/** A finding id: `R<round>-<number>`. */
export const FINDING_ID_PATTERN = /^R(\d+)-(\d+)$/

/** A round: a positive integer, no sign, no leading zero. */
export const ROUND_PATTERN = /^[1-9]\d*$/

/** A cell separator of a ledger row: a `|` not escaped by a backslash. */
export const CELL_SEPARATOR_PATTERN = /(?<!\\)\|/

/** A line break, refused inside a ledger value. */
export const LINE_BREAK_PATTERN = /[\r\n]/

/** The decision states, as `lot decide` takes them. */
export const DECISION_STATES = [
	'open',
	'fix-to-verify',
	'fixed <round> [note]',
	'accepted <reason>',
	'logged <where>',
] as const

/** The command the review rounds' verbs live under, and the first word of what each prints (`lot <verb>: `). */
export const LOT_COMMAND = 'lot'

export const CHOICE_USAGE = 'lot choice: expected <id|folder> --by <who> <decision>'

/** The options `lot choice` takes followed by a value, without the dashes. */
export const CHOICE_OPTIONS = ['by'] as const

/** The file of the decisions made outside the findings ledger, in the hand-over folder. */
export const DECISIONS_FILE = 'decisions.md'

/** The first header cell of the decisions table. */
export const DECISIONS_FIRST_CELL = 'decision'

/** The decisions table's header row and separator, each followed by a line feed. */
export const DECISIONS_TABLE_HEAD = '| decision | by | when |\n|---|---|---|\n'

export const FINDING_USAGE =
	'lot finding: expected <id|folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>'

export const DECIDE_USAGE = `lot decide: expected <id|folder> <finding> <state...>; states: ${DECISION_STATES.join(', ')}`

export const SNAPSHOT_USAGE = 'lot snapshot: expected <id|folder> --round <n>'

export const DELTA_USAGE =
	'lot delta: expected <id|folder> --round <n> (n >= 2: round 1 is a full review) [--worktree] [--json]'

/** The options each verb takes followed by a value, without the dashes. */
export const FINDING_OPTIONS = ['round', 'severity', 'at'] as const
export const ROUND_OPTIONS = ['round'] as const

/** Every option a review rounds' verb takes followed by a value: what skips to the folder word, the first positional one. */
export const REVIEW_ROUND_VALUE_OPTIONS: readonly string[] = [
	...new Set([...FINDING_OPTIONS, ...CHOICE_OPTIONS, ...ROUND_OPTIONS]),
]

/** The flags `lot delta` takes, without the dashes. */
export const DELTA_FLAGS = ['worktree', 'json'] as const

/** The suffix of the names a snapshot is built under before its final rename. */
export const PARTIAL_SUFFIX = '.partial'

/** Diff options that keep git's own plain diff whatever the repository or the user configured. */
export const PLAIN_DIFF_OPTIONS = ['--no-color', '--no-ext-diff', '--no-textconv'] as const

/** The missing side of a diff. */
export const NO_FILE = '/dev/null'

/** The line that heads each file of the fix diff's text. */
export const DELTA_FILE_MARK = '──'

/** The mode `git ls-tree` gives a submodule's gitlink. */
export const GITLINK_MODE = '160000 '
