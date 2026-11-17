/**
 * A path the change touches since the base, as the presence map holds it: present (new, changed, or the new side of a
 * rename git pairs), with its text when its path may hold test code (`TEST_CODE_PATH_PATTERNS`), or deleted (`atBase`:
 * the base held it; false for a path only the index holds).
 */
export type TestCodePath =
	| { state: 'added' | 'modified'; text?: string }
	| { state: 'renamed'; from: string; text?: string }
	| { state: 'deleted'; atBase: boolean }

/**
 * The presence map of a package's changed paths (FIX-ci-loop design, section 4): every path the change touches since
 * `base`, relative to the package root, read from one git read; a path it does not hold is unchanged since the base.
 */
export type TestCodePresence = {
	base: string
	paths: ReadonlyMap<string, TestCodePath>
}

/** What the change since the base is read from: the presence map the run built once (`changedTestCodeOf`). */
export type ChangeQuery = { root: string; base: string; presence: TestCodePresence }
