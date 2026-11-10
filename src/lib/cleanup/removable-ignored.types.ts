/** What `removableIgnored` is asked about one worktree, and what it reads when a part is not handed in. */
export type RemovableIgnoredParameters = {
	/** The worktree whose removal is asked about (absolute). */
	worktree: string
	/** The main checkout of the same repository (absolute): where copies and `package.json` declarations are read. */
	main: string
	/**
	 * Git's ignored entries of the worktree as `git status -z --porcelain --untracked-files=all --ignored=matching`
	 * prints them, one string per NUL-separated entry (`!! .dialecte/`, `!! docs/my file.xsd`; other statuses may be
	 * among them and are not ignored entries). Default: read from git in `worktree`.
	 */
	ignoredLines?: string[]
	/**
	 * The `lot.json` archived in each committed hand-over folder registered for this worktree, as bytes or as a
	 * text (its UTF-8 bytes); compared byte for byte. Default: read from the hand-over registry of the repository.
	 */
	archivedDeclarations?: readonly (string | Buffer)[]
	/**
	 * The hooks folder the repository configures (`core.hooksPath` as written, such as `.husky/_`); `null` when
	 * it configures none. Default: read from git config.
	 */
	hooksFolder?: string | null
}

/** What one call of `removableIgnored` reads once and hands to every entry it classifies. */
export type IgnoredWalk = {
	worktree: string
	/** The worktree's real path: a main-checkout entry whose real path lies in it is the worktree's own. */
	realWorktree: string
	main: string
	/** The archived declarations, as bytes, a `lot.json` may equal. */
	archivedDeclarations: readonly Buffer[]
	/** The folders that go at the worktree root, each ending with `/`: the rebuilt ones and the hooks folder. */
	rebuiltFolders: readonly string[]
	/** What the package holding each folder (relative to the worktree, `''` for its root) declares, read once. */
	declaredByFolder: Map<string, DeclaredRebuilt>
}

/** The package of the main checkout nearest a folder, and the valid folders its package.json declares rebuilt. */
export type DeclaredRebuilt = {
	/** The package root relative to the main checkout (`''` for its root, `packages/x`). */
	packageRoot: string
	/** Relative to the package root, each ending with `/`; empty when no package.json up to the main checkout. */
	folders: readonly string[]
}

/** The ignored entries a worktree removal would delete that nothing else holds. */
export type RemovableIgnoredResult = {
	/** The paths (relative to the worktree, files and links, sorted) that keep the worktree; empty = nothing is lost. */
	kept: string[]
}
