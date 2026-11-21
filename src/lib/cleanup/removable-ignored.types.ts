import type { CountedArchive } from '../handover/archived-declarations.types.ts'

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
	 * Every declaration archived for this worktree (its committed hand-overs' folders, its landed lot's own), each
	 * under its package path; a lot file is compared byte for byte with its own package path's only. Default: read
	 * from the hand-over registry of the repository.
	 */
	archivedDeclarations?: readonly CountedArchive[]
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
	/** The archived declarations, each under its package path, a `lot.json` of that package may equal. */
	archivedDeclarations: readonly CountedArchive[]
	/** The folders that go at the worktree root, each ending with `/`: the rebuilt ones and the hooks folder. */
	rebuiltFolders: readonly string[]
	/** What the package holding each folder (relative to the worktree, `''` for its root) declares, read once. */
	declaredByFolder: Map<string, DeclaredRebuilt>
}

/**
 * The package of the main checkout nearest a folder, and the valid folders it rebuilds: those its package.json
 * declares and the coverage outDir of each version the cli discovers there.
 */
export type DeclaredRebuilt = {
	/** The package root relative to the main checkout (`''` for its root, `packages/x`). */
	packageRoot: string
	/**
	 * Relative to the package root, each ending with `/` (declared ones, then the outDirs); empty when no package.json
	 * up to the main checkout.
	 */
	folders: readonly string[]
}

/** The ignored entries a worktree removal would delete that nothing else holds. */
export type RemovableIgnoredResult = {
	/** The paths (relative to the worktree, files and links, sorted) that keep the worktree; empty = nothing is lost. */
	kept: string[]
}
