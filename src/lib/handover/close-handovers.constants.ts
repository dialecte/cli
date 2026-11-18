/** `lot close`: what keeps a worktree beyond the shared keep rules. */

/**
 * Work that keeps the worktree: `{work}` (`workSinceLandingText` or `lostWorkText`), `{worktree}` where to look.
 */
export const CLOSE_KEPT_WORK = '{work} (look: git -C {worktree} reflog HEAD)'

/** A merged lot with no worktree to close: `{lot}` its name. */
export const NO_LOT_WORKTREE = 'the lot {lot} names no worktree on disk: nothing to close'
