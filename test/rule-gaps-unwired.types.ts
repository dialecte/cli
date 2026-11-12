/** What `dialecte gate --json` prints, the part the tests of the unwired steps read. */
export type GateJson = {
	mode: string
	ok: boolean
	reused?: true
	steps: {
		step: { name: string; run: string }
		status: string
		reason?: string
		unwired?: true
		optedOut?: string
	}[]
}

/** A scratch package whose scripts count their runs. */
export type UnwiredPackageParams = {
	/** The file every script (and the vitest stand-in) appends a line to per run. */
	counter: string
	/** The scripts the package defines, each counting its run; the others are missing. */
	scripts: readonly string[]
	/** The package's `"dialecte"` field. */
	dialecte?: Record<string, unknown>
}
