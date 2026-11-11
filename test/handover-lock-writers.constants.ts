import { join } from 'node:path'

/** The child process that takes the lock and ends: the lock then names a writer that is gone. */
export const TAKE_LOCK_CHILD = join(import.meta.dirname, 'take-lock-child.ts')

/** The bound on the child that takes the lock and exits: a guard against a hang, never a measure of speed. */
export const TAKE_LOCK_CHILD_BOUND_MS = 90_000

/** The file name of a hand-over script a writer would write. */
export const WRITER_SCRIPT_FILE = 'commit.sh'

/** The error the stand-in write fails with. */
export const WRITE_FAILURE_MESSAGE = 'the disk is full'
