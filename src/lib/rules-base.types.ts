/** The base the quality rules judge against, with where the one order found it (`resolveRulesBaseSource`). */
export type RulesBaseSource =
	| {
			/** The lot base read from git of the store lot whose worktree holds the package (its fork point). */
			commit: string
			source: 'lot'
			/** The name of that store lot. */
			lot: string
	  }
	| {
			/** The base branch's merge-base with head. */
			commit: string
			source: 'base-branch'
	  }
	| {
			/** The commit of the package's last release tag reachable from head. */
			commit: string
			source: 'release-tag'
			/** The release tag, `<name>@v<version>`. */
			tag: string
	  }
