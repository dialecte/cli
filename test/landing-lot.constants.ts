/** The lot of the landing-lot cases: its store name, its branch, its file and that file's first text. */
export const LANDING_LOT = '0001-repo-x'
export const LANDING_LOT_BRANCH = 'feat/x'
export const LANDING_LOT_FILE = 'src/x.ts'
export const LANDING_LOT_TEXT = 'export const x = 1\n'

/** What main writes over the lot's line once the lot squash-merged: the same lines edited again. */
export const MAIN_EDIT_TEXT = 'export const x = 2\n'

/** A file the lot commits after its landing: work of its own the base does not hold. */
export const AFTER_LANDING_FILE = 'src/after.ts'

/** The pull request number the fake host gives the lot's pull request. */
export const LANDING_PULL_NUMBER = 9

/** When the landing-lot cases run. */
export const LANDING_NOW = new Date('2026-11-17T22:00:00.000Z')

/** The declaration a lot worktree holds (`.dialecte/lot.json`). */
export const OWN_DECLARATION = '{ "tdd": "exempt: a landing case" }\n'
