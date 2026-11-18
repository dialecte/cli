/** `lot close`: what keeps a worktree beyond the shared keep rules, and why a lot cannot be registered. */

/**
 * Work that keeps the worktree: `{work}` (`workSinceLandingText` or `lostWorkText`), `{worktree}` where to look.
 */
export const CLOSE_KEPT_WORK = '{work} (look: git -C {worktree} reflog HEAD)'

/** A merged lot with no worktree to close: `{lot}` its name. */
export const NO_LOT_WORKTREE = 'the lot {lot} names no worktree on disk: nothing to close'

/** A lot argument whose lot is canceled: `{state}`; the close goes on by its entry. */
export const LOT_NOT_OPEN = 'its lot is {state}: nothing to settle'

/** A lot folder with no lot in it. */
export const NOT_A_LOT = 'no lot in that folder'
