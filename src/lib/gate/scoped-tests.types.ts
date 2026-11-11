/** What the gate hands a scoped step, as the scoped tests step reads it (`DIALECTE_GATE_*`). */
export type ScopedTestsEnvironment = {
	/** `DIALECTE_GATE_BASE`. */
	base: string
	/** `DIALECTE_GATE_TREE`. */
	tree: string
	/** `DIALECTE_GATE_CHANGED`: the file of the changed paths, NUL-separated. */
	changed: string
	/** `DIALECTE_GATE_SELECTION`: where the step writes its selection. */
	selection: string
}

/** What the scoped tests step answers: the exit code its step ends with, and its output (vitest's, unfiltered). */
export type ScopedTestsRun = {
	exitCode: number
	output: string
}
