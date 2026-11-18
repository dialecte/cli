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
