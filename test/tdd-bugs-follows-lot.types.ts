/** A scratch repository holding a lot branch cut from a base branch. */
export type LotScenario = {
	root: string
	/** The commit `main` held first. */
	start: string
	/** The commit the lot branch was cut at (the hygiene baseline's `head`). */
	cut: string
}
