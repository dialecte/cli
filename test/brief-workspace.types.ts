/** The scratch workspace of the brief tests: `<root>/ws/repo`, `<root>/ws/_commit-plan/lot/{brief.json,plan.md}`. */
export type BriefWorkspace = {
	workspace: string
	repository: string
	briefFolder: string
	briefPath: string
	/** `<git common folder>/dialecte-lots` (not made). */
	store: string
	/** `<git common folder>/dialecte-handover` (not made). */
	registry: string
	/** The full commit `main` points to. */
	commit: string
	/** `$XDG_STATE_HOME/dialecte/lot-stores`. */
	storeList: string
}
