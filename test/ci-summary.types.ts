/** What the `dialecte ci` tests read of the rendered template files. */
export type CiSummary = {
	paths: string[]
	ciJobs: string[]
	ciOkNeeds: string[]
	testWith: unknown
	cliRuns: string[]
	playwright: boolean
	slotsLeft: string[]
	/** The node_modules restores (every one outside _install.yml, which fills the cache) that fail on a cache miss. */
	restoresFailOnMiss: boolean
}
