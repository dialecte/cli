/** The scratch workspace of the plan tests. */
export type PlanWorkspace = {
	/** The real path of the test's own folder. */
	root: string
	/** `$XDG_STATE_HOME` (stubbed), not made. */
	state: string
	/** `<root>/plans`, made. */
	planFolder: string
	/** `<root>/plans/plan.md`, not written. */
	planPath: string
}
