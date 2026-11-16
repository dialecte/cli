/** The texts of the hook's tdd step (`hook-tdd.ts`). */

/** Why the tdd step of a merge commit is skipped. */
export const HOOK_TDD_MERGE_REASON =
	'a merge commit: its cases were proven on their branches, CI runs the merged suite'

/** Why the tdd step fails when the working files are not the commit: `{paths}` the paths tdd reads that differ. */
export const HOOK_TDD_NOT_THE_COMMIT_REASON = 'the working files are not the commit: {paths}'

/** Under a `HOOK_TDD_NOT_THE_COMMIT_REASON` failure: what to do. */
export const HOOK_TDD_NOT_THE_COMMIT_HINT =
	'the receipts prove the working files: commit them, or set the rest aside (git stash push --keep-index --include-untracked)'

/** Why the tdd step fails on greens older than the production: `{count}` the stale cases. */
export const HOOK_TDD_STALE_REASON =
	'{count} case(s) green before the production changed: run `dialecte tdd green` again'

/** The line of a stale case under the failure: `{label}` the case. */
export const HOOK_TDD_STALE_LINE = 'stale  {label}'

/** Between the paths of `HOOK_TDD_NOT_THE_COMMIT_REASON`. */
export const HOOK_TDD_PATH_SEPARATOR = ', '

/** What the hook's tdd step shows while it runs. */
export const HOOK_TDD_STEP_DETAIL = 'the receipts of the commit'
