/** What is true in a package (or a whole workspace), against which skill claims are verified. */
export type PackageFacts = {
	/** `discoverMethodPaths` output: `q.getTree`, `tx.reference.applyUuidRemap`, ... */
	methodPaths: ReadonlySet<string>
	/** Every file and folder, relative to the package root, `/`-separated. */
	repositoryPaths: readonly string[]
	npmScripts: ReadonlySet<string>
}

export type CheckSkillPageParams = {
	/** Path shown in findings, e.g. `skills/dialecte/SKILL.md`. */
	file: string
	markdown: string
	/** Set for a SKILL.md: frontmatter is validated against it. */
	folderName?: string
	/** Paths of the skill's own files, relative to the page's folder (for links). */
	siblingFiles: ReadonlySet<string>
	facts: PackageFacts
	/** Facts of the sibling packages, when the check runs with `--workspace`. */
	workspaceFacts?: Omit<PackageFacts, 'methodPaths'>
}
