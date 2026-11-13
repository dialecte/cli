import type { LotWorktree } from './lot-keep-workspace.types.ts'

/** How the lot's branch reaches `main`: a fast-forward, a merge commit (main moved on first), or not at all. */
export type LandedMerge = 'fast-forward' | 'merge-commit' | 'none'

/** A hand-over registered for a lot, outside the lot's folder. */
export type LandedHandover = {
	state: 'committed' | 'pending' | 'abandoned'
	/** Whose worktree and branch it names: the lot's own (default), another worktree's, or the lot's worktree on another branch. */
	names?: 'lot' | 'other-worktree' | 'other-branch'
}

/** A registered hand-over of a landed lot: its registry name and the folder it registers. */
export type RegisteredHandover = { name: string; folder: string }

/** A lot of the store, its real worktree, the commit its branch started from and the hand-overs registered for it. */
export type LandedLot = LotWorktree & {
	base: string
	handovers: RegisteredHandover[]
}
