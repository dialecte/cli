/** The lot branch of a landing repository. */
export const LOT_BRANCH = 'feat/x'

/** The lot's file and its first text. */
export const LOT_FILE = 'src/x.ts'
export const LOT_TEXT = 'export const x = 1\n'

/** The base ref every landing test reads. */
export const ORIGIN_MAIN = 'refs/remotes/origin/main'

/** The url the fake host gives a pull request. */
export const CHANGE_REQUEST_URL = 'https://host.test/pull/{number}'

/** The stacked child lot's branch, its file and its text. */
export const CHILD_BRANCH = 'feat/y'
export const CHILD_FILE = 'src/y.ts'
export const CHILD_TEXT = 'export const y = 1\n'

/** The file and text an earlier lot of a reused branch name committed. */
export const EARLIER_LOT_FILE = 'src/earlier.ts'
export const EARLIER_LOT_TEXT = 'export const earlier = 1\n'

/** The environment of a git command that would open an editor (a rebase continued): none opened. */
export const NO_EDITOR = { GIT_EDITOR: 'true' } as const
