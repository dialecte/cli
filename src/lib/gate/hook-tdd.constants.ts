/** The texts of the hook's tdd step (`hook-tdd.ts`). */
import { PASS_KINDS } from '../tdd/tdd.constants.ts'

/** Why the tdd step of a merge commit is skipped. */
export const HOOK_TDD_MERGE_REASON =
	'a merge commit: its cases were proven on their branches, CI runs the merged suite'

/** Why the tdd step fails when the working files are not the commit: `{paths}` the paths tdd reads that differ. */
export const HOOK_TDD_NOT_THE_COMMIT_REASON = 'the working files are not the commit: {paths}'

/** Under a `HOOK_TDD_NOT_THE_COMMIT_REASON` failure: what to do. */
export const HOOK_TDD_NOT_THE_COMMIT_HINT =
	'the receipts prove the working files: commit them, or set the rest aside (git stash push --keep-index --include-untracked)'

/** Why the tdd step fails on cases not proven at the production committed: `{count}` those cases of the lot. */
export const HOOK_TDD_STALE_REASON =
	'{count} case(s) of the lot not proven at the production committed'

/** The last line under a stale or refused case: a plain green proves it again. */
export const HOOK_TDD_GREEN_AGAIN_LINE = 'run `dialecte tdd green` again'

/** Why the tdd step of a repository's first commit is skipped. */
export const HOOK_TDD_FIRST_COMMIT_REASON =
	'a first commit: no receipt can be taken before one, CI runs the suite'

/** The line of a stale case under the failure (proven at another production): `{label}` the case. */
export const HOOK_TDD_STALE_LINE = 'stale  {label}'

/** The line of a case whose last run at its test file now refused it: `{label}` the case. */
export const HOOK_TDD_REFUSED_LINE = 'refused  {label}  its last run refused'

/**
 * The line of a case holding no proof receipt (moved into a file a red ran before the move): `{label}` the case. A red
 * of every changed file pairs the move (a red of one file sees no source outside it).
 */
export const HOOK_TDD_UNPROVEN_LINE = 'unproven  {label}  run dialecte tdd red'

/**
 * The statuses of a closed case, the hook proves each at the production committed: a status names the kind of the
 * receipt that closes it, so they are the pass kinds.
 */
export const HOOK_TDD_PROVEN_STATUSES: readonly string[] = PASS_KINDS

/** Between the paths of `HOOK_TDD_NOT_THE_COMMIT_REASON`. */
export const HOOK_TDD_PATH_SEPARATOR = ', '

/** What the hook's tdd step shows while it runs. */
export const HOOK_TDD_STEP_DETAIL = 'the receipts of the lot'
