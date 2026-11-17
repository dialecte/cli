import { DECISION_STATES } from './review-rounds.constants.ts'

/** The schema of a `review.jsonl` row. */
export const REVIEW_RECORD_SCHEMA = 1

/** The stations whose ends carry a review's verdict; the test-reviewer's belong to the tests record. */
export const REVIEW_STATIONS: readonly string[] = ['reviewer', 'independent-reviewer']

/** The verdict of a `lot verify` line: the late fixes of a tree verified. */
export const VERIFY_VERDICT = 'verified'

/** The states `lot decide` takes, by their first word (`fixed <round> [note]` → `fixed`): a row's state words. */
export const ROW_STATE_WORDS: readonly string[] = DECISION_STATES.map(function firstWord(state) {
	return state.split(' ')[0]
})

/**
 * A state cell: a state word as `lot decide` takes it or writes it (`fix-to-verify`, `fix to verify`), then for
 * `fixed` the round that verified the fix, then whatever note follows.
 */
export const STATE_CELL_PATTERN = new RegExp(
	`^(${ROW_STATE_WORDS.flatMap(function bothSpellings(word) {
		return [word, word.replaceAll('-', ' ')]
	}).join('|')})(?:\\s+([1-9]\\d*))?(?:\\s|\\(|$)`,
)

/** The `:line` (or `:line-line`, `:line:column`) ending a `file:line` cell. */
export const LINE_SUFFIX_PATTERN = /:\d+(?:[-:]\d+)?$/

/** The `./` a path may start with, dropped before it is looked up. */
export const CURRENT_FOLDER_PREFIX = /^(?:\.\/)+/

/** A finding id a row may carry: a tag, a dash and a number (`R1-2`, `I-1`), or a short tag alone (`F5`). */
export const ROW_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,9}(?:-\d{1,4})?$/

/** The cells of a ledger row: id, round, severity, file:line, finding, state (the last cell). */
export const LEDGER_ROW_CELLS = 6

/** A vendor or model word a verdict row keeps: letters, digits, `.`, `_`, `-` (never a path, a link or a sentence). */
export const VERDICT_WORD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** What git lists as the files of a worktree: tracked, and untracked but not ignored. */
export const WORKTREE_FILES_ARGUMENTS: readonly string[] = [
	'ls-files',
	'-z',
	'--cached',
	'--others',
	'--exclude-standard',
]

/** `git ls-tree` of a commit's files, NUL-separated: the base commit follows. */
export const BASE_FILES_ARGUMENTS: readonly string[] = ['ls-tree', '-r', '--name-only', '-z']

/** The verdict of a `lot approve` line: a person approved the pull request. */
export const APPROVE_VERDICT = 'approve'

/** The severity that blocks an approval while its finding is not closed. */
export const BLOCKING_SEVERITY = 'blocking'

/** The finding states that close a finding: every other one (open, a fix to verify) is still open. */
export const CLOSED_STATES: readonly string[] = ['fixed', 'accepted', 'logged']
