/** `lot close`: the words of the commits it compares with what landed. */

/**
 * The diff options of the patches `lot close` compares with the lot's landed ones: the repository's own diff, never an
 * external diff tool or a text conversion (they would make two patches look alike or apart).
 */
export const PATCH_DIFF_OPTIONS = ['--no-ext-diff', '--no-textconv'] as const

/**
 * `lot close` of a lot whose pull request merged at a head that is neither the one its landing recorded nor the
 * worktree's HEAD: `{number}`, `{merged}`, `{landed}`, `{head}` (short shas).
 */
export const LANDING_MERGED_AT_OTHER_HEAD =
	"pull request #{number} merged at {merged}, not at the landed head {landed} nor the worktree's HEAD {head}: the lot is not marked committed (look: what merged is not this lot's tip)"
