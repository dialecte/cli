import type { ScopeChangeOp } from '../lib/store/scope-changes.types.ts'

/** What `lot scope` was asked, its usage checked: the op, the paths as given, and who and why for an add. */
export type ScopeRequest = {
	id: string
	op: ScopeChangeOp
	paths: string[]
	by?: string
	reason?: string
}

/** A lot `lot scope` may change: its folder, name, worktree and repository, and its scope changes so far. */
export type ScopeTarget = {
	lotFolder: string
	name: string
	worktree: string | null
	repository: string
}

/** The points a test may act at, between the steps of a change. */
export type ScopeSeams = {
	/** Called once the change is appended, before the add re-reads the other open lots. */
	afterAppend?: () => void
}
