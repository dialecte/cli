export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

/** The clock of the worktree rules: the end of the health window. */
export const WORKTREES_NOW = new Date('2026-11-15T12:00:00.000Z')

export const WORKTREES_FOLDER = '/workspace/.worktrees'
export const WORKTREE_LOT = '0108-cli-health-obs1'

/** The values of the thresholds the spec pins. */
export const WORKTREE_IDLE_SPEC_MS = 86_400_000
export const WORKTREE_ADD_BUDGET_SPEC_MS = 60_000
export const SCRATCH_LEAK_SPEC_MS = 21_600_000

export const SCRATCH_REPOSITORY = 'scratch'
export const TMP_FOLDER = '/tmp'

/** A time of the reader's cases, in whole seconds (a file time keeps no more). */
export const FIRST_FILE_TIME = new Date('2026-11-10T08:00:00.000Z')
export const SECOND_FILE_TIME = new Date('2026-11-12T09:30:00.000Z')
export const CLOSED_AT = '2026-11-13T10:00:00.000Z'
