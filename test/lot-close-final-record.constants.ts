/** The time the `lot close` cases of the final record run at. */
export const FINAL_RECORD_NOW = new Date('2026-11-10T10:00:00.000Z')

/** The time a hook record of the cases says the hook ran at. */
export const HOOK_RECORD_AT = '2026-11-10T09:30:00.000Z'

/** The time a lot of the cases was canceled at. */
export const CANCELED_AT = '2026-11-08T11:00:00.000Z'

/** The name of the file a hook record is kept in (in the worktree's git folder). */
export const HOOK_RECORD_NAME = 'dialecte-gate-hook.json'

/** The name of the log of the final records, in the repository's registry folder. */
export const FINAL_RECORD_LOG_NAME = 'cards.log'

/** The text `lot close` keeps a worktree with when no record of its lot could be kept. */
export const FINAL_RECORD_NOT_KEPT = 'final record not kept:'

/** The text `lot close` keeps a worktree with when the commit its lot ended at is not known. */
export const COMMIT_NOT_KNOWN = "the lot's commit is not known"

/** The parts of the way out a kept "commit not known" ends with: where to look, the removal by hand, its cost. */
export const LOOK_HINT = 'look: git -C {worktree} log'
export const REMOVE_BY_HAND_HINT =
	'the worktree can be removed by hand with git worktree remove {worktree}'
export const RECORDS_GONE_HINT = 'its records are then gone'

/** The file a fake `npx` of the cases leaves behind when something starts it. */
export const PROBE_MARKER_NAME = 'npx-was-started'

/** The file of the lot's asks the cases write. */
export const ASK_FILE_NAME = 'A-1.json'

/** What a full commit id looks like. */
export const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/

/** What the id of a removal looks like. */
export const REMOVAL_ID_PATTERN = /^rm-/

/** The file the lot of a hand-over adds to its worktree. */
export const LOT_SOURCE_FILE = 'src/close.ts'
