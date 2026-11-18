/** A lot file of a worktree: the root's `.dialecte/lot.json`, or a package's. */
export type LotFile = {
	/** The package's folder relative to the worktree, with `/`; `''` for the root. */
	packagePath: string
	/** The lot file's absolute path. */
	file: string
}
