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
