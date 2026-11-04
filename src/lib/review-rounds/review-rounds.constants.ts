/** The names, spellings and usages of a lot's review rounds: the findings ledger, the snapshots, the fix diff. */

/** The findings ledger's file name in the hand-over folder. */
export const LEDGER_FILE = 'findings-ledger.md'

/** The ledger table's header row and separator, each followed by a line feed. */
export const LEDGER_TABLE_HEAD =
	'| id | round | severity | file:line | finding | state |\n|---|---|---|---|---|---|\n'

/** The severities `record review` accepts, each with how it is written in the ledger. */
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

/** The decision states, as `record decision` takes them. */
export const DECISION_STATES = [
	'open',
	'fix-to-verify',
	'fixed <round> [note]',
	'accepted <reason>',
	'logged <where>',
] as const

export const RECORD_USAGE =
	'record: review <folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding> | decision <folder> <id> <state...> | snapshot <folder> --round <n> | choice <folder> --by <who> <decision> | standard <folder> consulted <note> | not-consulted <reason>'

export const RECORD_CHOICE_USAGE = 'record choice: expected <folder> --by <who> <decision>'

/** The options `record choice` takes followed by a value, without the dashes. */
export const CHOICE_OPTIONS = ['by'] as const

/** The file of the decisions made outside the findings ledger, in the hand-over folder. */
export const DECISIONS_FILE = 'decisions.md'

/** The first header cell of the decisions table. */
export const DECISIONS_FIRST_CELL = 'decision'

/** The decisions table's header row and separator, each followed by a line feed. */
export const DECISIONS_TABLE_HEAD = '| decision | by | when |\n|---|---|---|\n'

export const RECORD_REVIEW_USAGE =
	'record review: expected <folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>'

export const RECORD_DECISION_USAGE = `record decision: expected <folder> <id> <state...>; states: ${DECISION_STATES.join(', ')}`

export const RECORD_SNAPSHOT_USAGE = 'record snapshot: expected <folder> --round <n>'

export const REVIEW_USAGE =
	'review: delta <folder> --round <n> (n >= 2: round 1 is a full review) [--worktree] [--json]'

export const REVIEW_DELTA_USAGE =
	'review delta: expected <folder> --round <n> (n >= 2: round 1 is a full review) [--worktree] [--json]'

/** The options each subcommand takes followed by a value, without the dashes. */
export const RECORD_REVIEW_OPTIONS = ['round', 'severity', 'at'] as const
export const ROUND_OPTIONS = ['round'] as const

/** The flags `review delta` takes, without the dashes. */
export const REVIEW_DELTA_FLAGS = ['worktree', 'json'] as const

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
