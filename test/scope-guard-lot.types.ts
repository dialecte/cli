import type { LandingLot } from './landing-lot.types.ts'

/**
 * A store lot of a brief workspace held to its scope: its own worktree and branch, its whole `brief.json`, a package
 * whose `gate --full` runs one counting `check` step, its repository's main pushed to a bare origin and moved on after
 * the lot's cut by a commit outside the lot's scope.
 */
export type ScopeGuardLot = LandingLot & {
	/** The main checkout. */
	root: string
	/** The file the package's counting `check` step appends a line to on each run. */
	counter: string
}

/**
 * Where a hand-over's file outside the lot's scope is: pending in `lots.json`, committed on the lot's branch and absent
 * from `lots.json`, or nowhere.
 */
export type OutsideFile = 'pending' | 'committed' | 'none'
