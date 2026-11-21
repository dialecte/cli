/** The lot's branch in a throwaway workspace: its throwaway is on `feat/fix-round-1`. */
export const THROWAWAY_LOT_BRANCH = 'feat/fix'

/** When a throwaway workspace's snapshot and throwaway are taken. */
export const THROWAWAY_WORKSPACE_NOW = new Date('2026-11-18T10:00:00Z')

/** The message of the commit that takes a review round's changes into the lot's own worktree. */
export const ROUND_COMMIT_MESSAGE = 'fix: the round'

/** What a run that printed nothing reads as. */
export const NO_JSON = '<no output>'

/** The id of the `removing` / `removed` lines an earlier `lot prune` wrote for a throwaway now waiting on its branch. */
export const WAITING_REMOVAL_ID = 'earlier-lot-prune-1'

/** The files a `lot prune` run may add to a lot folder: its landed fact, its archived declarations. */
export const ALLOWED_NEW_LOT_FILES: readonly string[] = [
	'landed.json',
	'lot.json',
	'lot.landed.json',
]

/** The id of the `removing` line a killed `lot prune` left with no outcome line. */
export const KILLED_REMOVAL_ID = 'killed-lot-prune-1'

/** The feature `lot close --feature` closes in its cases (the bystander lot of `landingLotOf` is of another). */
export const CLOSED_FEATURE = 'alpha'

/** A process start time no running process has: a marker holding it names a pid reused since. */
export const REUSED_PID_START_TIME = 'Thu Jan  1 00:00:00 1970'

/** When a rehearsal marker of the cases says its clone was made. */
export const REHEARSAL_STARTED_AT = '2026-11-18T09:00:00.000Z'

/** The folder a rehearsal clone takes inside its rehearsal folder: named as the repository it clones. */
export const REHEARSAL_CLONE_FOLDER = 'repo'

/** The command every clone `lot close --feature` cannot move names: `worktree prune` decides it later. */
export const WORKTREE_PRUNE_COMMAND = 'dialecte worktree prune'

/** The start time a revived clone's marker holds, read back equal at the move: its owner runs again. */
export const REVIVED_START_TIME = 'Sat Nov 21 04:00:00 2026'

/** A process the cases list as working inside a clone: no process of the machine holds this pid's folder. */
export const WORKING_PID = 424242

/** What a process lister answers when it cannot list the processes. */
export const PROCESSES_UNKNOWN = 'the processes cannot be listed: lsof is not installed'
