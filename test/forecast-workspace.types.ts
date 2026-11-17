/** The scratch workspace of the forecast tests: a repository cloned from its own origin, lots started into its store. */
export type ForecastWorkspace = {
	/** The folder `lot start` runs from (it holds the repository and the brief folder). */
	workspace: string
	/** The main checkout, whose origin is `origin`. */
	repository: string
	/** The repository a commit on main is made in, then fetched into `repository`. */
	origin: string
	briefFolder: string
}

/** A lot the workspace started: its name, its folder in the store and its worktree. */
export type ForecastTestLot = { name: string; lotFolder: string; worktree: string }
