/** `lot land`'s push and `lot close`'s confirmation of a landing: the lines beside `LANDING_LINES`. */

/** A lot whose branch holds no commit beyond origin's base: `{branch}`, `{base}`, `{head}` (short sha). */
export const NOTHING_BEYOND_BASE_LINE =
	'lot land: {branch} holds no commit beyond origin/{base} ({head}): commit the lot first (a refused commit hook leaves the work uncommitted), nothing pushed'

/**
 * `lot close` of a lot whose pull request merged at a head that is neither the one its landing recorded nor the
 * worktree's HEAD: `{number}`, `{merged}`, `{landed}`, `{head}` (short shas).
 */
export const LANDING_MERGED_AT_OTHER_HEAD =
	"pull request #{number} merged at {merged}, not at the landed head {landed} nor the worktree's HEAD {head}: the lot is not marked committed (look: what merged is not this lot's tip)"
