/** Names of the scratch hand-over a target branch moves past: its branch, its two plain lots, its merge lot. */

/** The file and text the branch commits past `main` in the merge hand-over, and the message of its merge lot. */
export const FEATURE_FILE = 'src/feature.ts'
export const FEATURE_TEXT = 'export const feature = 1\n'
export const MERGE_MESSAGE = 'merge: bring main in'

/** The branch the lots go on, cut from `main`. */
export const FEATURE_BRANCH = 'feat/x'

/** The first plain lot's file and message. */
export const FIRST_LOT_FILE = 'src/first.ts'
export const FIRST_LOT_MESSAGE = 'feat(first): add the first file'

/** The second plain lot's file and message. */
export const SECOND_LOT_FILE = 'src/second.ts'
export const SECOND_LOT_MESSAGE = 'feat(second): add the second file'

/** The message of a merge lot that brings the target branch in. */
export const MERGE_LOT_MESSAGE = 'merge: bring the target branch in'

/** The message of a commit that moves a branch. */
export const MOVE_MESSAGE = 'feat: the branch moves on'

/** The text of a lot's file once committed. */
export const LOT_FILE_TEXT = 'export const value = 1\n'
