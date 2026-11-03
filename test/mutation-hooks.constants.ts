/** What the tests of the mutation hooks (card, guard, recap, prune) share. */

export const OTHER_PACKAGE_NAME = 'other-pkg'
export const OTHER_PACKAGE_FOLDER = 'packages/other'
export const OTHER_SCOPE_FILE = 'src/engine/other.ts'

/** The tree a started run names unless a test gives one; a gate lot's verdict reads it (a reported run on the handed-over tree). */
export const HOOKS_TREE = 'a'.repeat(40)

/** The follow-up a scheduled survivor names. */
export const FOLLOW_UP = 'follow-up-lot'

/** The mutated expression of a second survivor, on line 5 of the scope file. */
export const SECOND_SURVIVOR_LINE = 5
export const SECOND_SURVIVOR_MUTATION = 'EqualityOperator: x === 1 -> x !== 1'

/** The closing line every failed verdict with items prints. */
export const ACT_ON_EACH_LINE =
	'act on each: a test that kills it, a recorded reason in .dialecte/mutation-records.json, or dialecte mutants schedule <follow-up>'

/** `dialecte mutants status` closes the counts of a failed verdict. */
export const STATUS_TAIL = ': dialecte mutants status'

/** The step of the scratch package's gate: one passing line the gate reads as 4 tests. */
export const GREEN_CHECK_RUN = `printf ' Tests  4 passed (4)\\n'`

/** A reason a recorded survivor is listed with. */
export const RECORDED_REASON = 'no output reads it'

/** The words the card and the guard use for the mutation line. */
export const MUTATION_GATE_NAME = 'mutation'

/** The bound of a case that checks out branches, starts child processes and runs gates: a hang guard, never a speed measure. */
export const SLEEPER_SECONDS = '600'

/** The branch a merge hand-over merges. */
export const MERGED_BRANCH = 'feat/x'
