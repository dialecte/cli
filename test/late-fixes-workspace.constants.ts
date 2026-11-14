/** The time the late-fix cases take their snapshots at. */
export const SNAPSHOT_TIME = new Date(2026, 10, 12, 10, 30, 0)

/** The effort that gives a cap of three review rounds. */
export const CAP_THREE_EFFORT = 'high'

/** A file the cases edit in the worktree, and a second one. */
export const FIRST_EDITED_FILE = 'late-one.ts'
export const SECOND_EDITED_FILE = 'late-two.ts'

/** A whole text for each file, by version. */
export const FIRST_VERSION = 'export const late = 1\n'
export const SECOND_VERSION = 'export const late = 2\n'
export const THIRD_VERSION = 'export const late = 3\n'

/** The people the verify lines name. */
export const FIRST_VERIFIER = 'person-a'
export const SECOND_VERIFIER = 'person-b'

/** A state hash no worktree has. */
export const OTHER_STATE = 'd'.repeat(64)

/** The first bytes of a verify line a crash cut short. */
export const TORN_LINE = '{"schema":1,"at":"2026-11-12T10:31:00.000Z","by":"person-b","no'
