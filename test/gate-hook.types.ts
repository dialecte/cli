/** A scratch package for `gate --hook`: its full gate holds a `check` step and a counting `tests` step. */
export type HookPackage = {
	root: string
	/** One line per run of the `check` step. */
	checkCounter: string
	/** One line per run of the `tests` step. */
	testCounter: string
	/** The file the `tests` step needs to pass (outside the repository). */
	requires: string
}

/** A case of the table: a state in which the hook runs the tests instead of reusing. */
export type RunInsteadCase = {
	name: string
	/** The package's `tests` step fails until `requires` exists. */
	requiresMissing?: boolean
	/** The package links `file:../dep`. */
	linked?: boolean
	/** Leaves the package in the state under test. */
	setup(hookPackage: HookPackage): Promise<void>
}
