import type { WorktreeRecordTimes } from './unrecorded-steps.types.ts'

/**
 * The record times of a worktree top: `worktree` is its real path; `tdd` is `null` when the ledger exists but cannot
 * be read (not `[]`: the tdd families are then unknown), `[]` when there is none.
 */
export type ReadRecordTimes = WorktreeRecordTimes

/** What reading a worktree's records gave: its git folder is gone, or the times (`cut` when older tdd entries were dropped). */
export type RecordTimesRead = { gone: true } | { gone: false; times: ReadRecordTimes; cut: boolean }

/** A mutation run file of the repository as stored: its state is the run's (`running`, `reported`, `abandoned`). */
export type MutationRunFile = { worktree: string; startedAt: string; state: string }
