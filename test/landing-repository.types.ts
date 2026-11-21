import type { HostAdapter, ChangeRequest } from '../src/lib/host/host.types.ts'

/** A repository with a bare origin, `main` pushed, and a lot branch cut from it with one commit. */
export type LandingRepository = {
	/** The repository the lot lives in (its main checkout). */
	root: string
	/** The bare origin. */
	origin: string
	/** The lot's worktree, on its branch. */
	worktree: string
	/** The lot's branch. */
	branch: string
	/** The commit the lot was cut from. */
	cut: string
	/** The lot branch's first commit. */
	tip: string
}

/** How a branch reaches origin's main: a fast-forward, a merge commit, or a squash. */
export type OriginMerge = 'fast-forward' | 'merge-commit' | 'squash'

/** What the fake host answers a pull request read with: by number, by branch, or its refusal. */
export type LandingHostAnswers = {
	byNumber?: Record<number, ChangeRequest>
	byBranch?: Record<string, ChangeRequest>
	refusal?: string
}

/** A host that answers pull request reads from memory and records each ref it was asked. */
export type LandingHost = {
	host: HostAdapter
	asked: string[]
}
