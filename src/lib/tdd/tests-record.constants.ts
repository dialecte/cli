/** The schema of `tests.json`. */
export const TESTS_RECORD_SCHEMA = 1

/** The progress step of `tdd green` while it reads the cases for the lot's `tests.json`. */
export const TESTS_RECORD_STEP = 'tdd green: tests.json'

/** `git rev-parse` of the worktree's top folder: a run's tree is its lot's only when it is the lot's own worktree. */
export const WORKTREE_TOP_ARGUMENTS: readonly string[] = ['rev-parse', '--show-toplevel']

/** `git rev-parse` of the commit the tdd part's cases were read on. */
export const HEAD_ARGUMENTS: readonly string[] = ['rev-parse', 'HEAD']

/** Why a tdd part is not written in a tree with no commit to name. */
export const NO_HEAD_REASON = 'no HEAD to name the tree'

/** The unknown entry an older cli's gate part failing on its counts becomes: its failures were never named. */
export const OLDER_CLI_FAILURE = 'a gate run of an older cli failed {failed} test(s) and named none'

/** The base source of a gate run whose scoped steps select against the empty tree: every file (`gate --release`). */
export const WHOLE_SUITE_BASE_SOURCE = 'release'

/** Why a `tests.json` does not read, and the unknown failure a damaged one becomes. */
export const TESTS_FILE_FAULTS = {
	noObject: 'it holds no object',
	schema: 'it is no record of schema 1',
	field: 'its field {field} holds what no writer writes',
	damaged: 'tests.json did not read ({why}): its failures cannot be told',
} as const

/** The string fields every part of `tests.json` holds. */
export const PART_STRING_FIELDS = ['at', 'head', 'stateHash'] as const

/** The count fields a gate part may hold, each an object of numbers. */
export const GATE_COUNT_FIELDS = ['tests', 'testFiles'] as const
