import type { LotStateName } from '../lib/store/store.types.ts'

/** A store lot as its pull request verbs find it: its name, folder, worktree, branch, base and state. */
export type LotPlace = {
	lot: string
	lotFolder: string
	worktree: string
	branch: string
	/** The base branch its pull request lands on, as git names it (`origin/main`). */
	baseRef: string
	state: LotStateName
}
