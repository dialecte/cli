/** `lot close`: the words of the commits it compares with what landed. */

/**
 * The diff options of the patches `lot close` compares with the lot's landed ones: the repository's own diff, never an
 * external diff tool or a text conversion (they would make two patches look alike or apart).
 */
export const PATCH_DIFF_OPTIONS = ['--no-ext-diff', '--no-textconv'] as const
