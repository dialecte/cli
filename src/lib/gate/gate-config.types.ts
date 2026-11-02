/** One command of the gate. */
export type GateStep = {
	/** Shown on the step's line: `check`, `tests`. */
	name: string
	/** A shell command, run from the package root, its output unfiltered. */
	run: string
	/** `tests`: the step fails when its output counts no test. */
	counts?: 'tests'
	/**
	 * The step runs only the tests the change affects (`vitest run --changed`): when its runner says no
	 * test file is affected (a doc-only change), the step passes with a note instead of failing on zero.
	 */
	changedOnly?: boolean
	/** The package's `generatedDocs` are restored byte for byte after this step, whatever its result. */
	restoresGeneratedDocs?: boolean
}
