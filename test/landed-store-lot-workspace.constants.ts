/** The lot of the landed-lot cases: its name, and the branch and worktree folder name that go with it. */
export const LANDED_LOT = '0001-repo-lookups'
export const LANDED_BRANCH = 'feat/lookups'

/** The lot a case runs beside the landed one, as a near miss. */
export const NEAR_MISS_LOT = '0002-repo-nearmiss'

/** The branch a hand-over names when it is registered for the lot's worktree on another branch. */
export const OTHER_BRANCH = 'feat/elsewhere'

/** What the main branch gains before a merge commit, and the message of that merge. */
export const LANDED_MAIN_COMMIT = 'chore: main moves on'
export const LANDED_MERGE_MESSAGE = 'merge: the lot'

/** The file `main` gains for the lot whose branch tail is `tail`. */
export function mainSideFileOf(tail: string): string {
	return `src/main-side-${tail}.ts`
}

/** The time the hand-overs of the landed-lot cases are written at, and the one a close of one of them runs at. */
export const LANDED_WRITTEN = new Date('2026-11-08T14:00:00.000Z')
export const LANDED_CLOSED_AT = new Date('2026-11-12T09:00:00.000Z')

/** When a lot resumed after its hand-over (later than `LANDED_WRITTEN`): its extra transition and its run marker. */
export const RESUMED_AT = '2026-11-09T10:00:00.000Z'

/** The time an entry of the entry table is written at unless a row says another. */
export const EARLY_WRITTEN = '2026-11-01T09:00:00.000Z'
