import type { BaseBranchRef } from '../src/lib/gate/gate-base.types.ts'
import type { PackageJson } from '../src/lib/package-json.types.ts'
import type { Refusal } from '../src/lib/refusal.types.ts'

/** The two commits of a repository whose `develop` is one ahead of `main`. */
export type DevelopAhead = { start: string; develop: string }

/** One case of the base-branch resolver table: the repository it builds, the package.json it reads, what it answers. */
export type BaseBranchRow = {
	/** The case's full title. */
	title: string
	/** Makes the repository and gives its path. */
	build: () => string
	packageJson: PackageJson
	expected: BaseBranchRef | Refusal
}
