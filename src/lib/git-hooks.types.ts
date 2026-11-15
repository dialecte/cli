/** Where git looks for a repository's hooks. */
export type HooksFolder = {
	/** `core.hooksPath` as configured, or undefined for git's own `hooks` folder. */
	configured: string | undefined
	/** Absolute path of the folder. */
	folder: string
}

/** A commit hook file: its name (the hook git runs it as) and its bytes. */
export type CommitHookFile = { name: string; bytes: Buffer }

/** The folder of the hook scripts git runs, part of the repository. */
export type HookScriptsInRepository = {
	/** Relative to the work tree's top, `/`-separated; empty for the top itself. */
	path: string
	/** Absolute path of the folder on disk. */
	folder: string
	/** Husky's layout: a script runs whatever its mode. */
	husky: boolean
}

/** One entry `git ls-tree` prints. */
export type TreeEntry = { mode: string; type: string; object: string; path: string }
