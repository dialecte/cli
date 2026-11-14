/** A hunk header of a `git diff -U0`: the first line the hunk adds and how many. */
export const DIFF_HUNK = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/

/** The line naming a file's new path in a diff. */
export const DIFF_NEW_PATH = '+++ b/'
