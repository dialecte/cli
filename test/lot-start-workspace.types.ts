import type { BriefWorkspace } from './brief-workspace.types.ts'

/** A scratch workspace ready for `lot start`: where everything a start makes lands, as real paths. */
export type StartWorkspace = {
	workspace: BriefWorkspace
	/** The real path of the repository's main checkout. */
	repository: string
	/** The real path of `<git common folder>/dialecte-lots`. */
	store: string
	/** The workspace's `.worktrees/` folder (real path of its parent, joined; not made). */
	worktreesFolder: string
	/** The folder the test runs the command from. */
	cwd: string
}
