import type { BriefWorkspace } from './brief-workspace.types.ts'

/** A store lot whose pull request `lot pr` renders: its workspace, store folder, worktree and landed tree's hash. */
export type ChangeRequestLot = {
	workspace: BriefWorkspace
	lotFolder: string
	worktree: string
	treeHash: string
}
