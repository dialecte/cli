import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { LandingRepository } from './landing-repository.types.ts'

/**
 * A lot of a brief workspace's store with a real worktree, its repository pushed to a bare origin: the workspace, the
 * lot's name, folder, branch, worktree and first commit, and the same repository as the landing model's helpers take it.
 */
export type LandingLot = {
	workspace: BriefWorkspace
	name: string
	lotFolder: string
	branch: string
	worktree: string
	tip: string
	repository: LandingRepository
}
