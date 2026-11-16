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

/** What `test-graph.ts` writes: each test file of the package with the package files it reaches, from the root. */
export type TestGraph = {
	/** Every file a test file reaches, through any number of imports. */
	dependencies: Record<string, string[]>
	/** The files a test file imports itself. */
	imports: Record<string, string[]>
}

/**
 * A changed file most test files reach: its far reach left to CI, with how many test files reach it of how many there
 * are; `direct` the test files importing it themselves, run here unless they too are past the share and the floor
 * (`directRan`).
 */
export type SharedPath = {
	path: string
	related: number
	total: number
	direct: number
	directRan: boolean
}
