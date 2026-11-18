import type { LOST_WHYS } from './lost-work.constants.ts'

/**
 * Why a commit a removal would lose was held only by what the removal takes: `dropped` when a reflog of its branch
 * name held it (work reset or rebased away from the branch), `detached` when only a HEAD reflog held it (a commit made
 * on a detached HEAD, or on a branch since deleted).
 */
export type LostWhy = (typeof LOST_WHYS)[number]

/** A commit a removal would lose, with why: its full id. */
export type LostCommit = { commit: string; why: LostWhy }

/** Everything one removal takes, as one set: worktrees by their path, branches by their short name. */
export type Removal = { worktrees: string[]; branches: string[] }
