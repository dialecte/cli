import type { HostAdapter, PullRequest } from '../src/lib/host/host.types.ts'

/** A repository to land a lot from: its main checkout, its bare origin, the lot's worktree and store folder. */
export type LandingRepository = {
	root: string
	origin: string
	worktree: string
	lotFolder: string
}

/**
 * A fake host, the calls it was asked in order, and the body of each pull request it opened; `setParent` and
 * `setPullRequest` change what it answers next (a parent merged, a pull request the host retargeted).
 */
export type RecordingHost = {
	host: HostAdapter
	calls: string[]
	bodies: string[]
	setParent: (next: PullRequest) => void
	setPullRequest: (next: PullRequest) => void
}

/** A stack of two lots: the parent `feat/x` pushed with pull request #5 recorded, the child `feat/y` one commit on it. */
export type StackedRepository = {
	root: string
	origin: string
	store: string
	parent: { worktree: string; lotFolder: string; tip: string }
	child: { worktree: string; lotFolder: string }
}
