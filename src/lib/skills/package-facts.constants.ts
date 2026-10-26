/** Folder names (or package-relative paths) never named by a skill: dependencies, build output, caches. */
export const EXCLUDED_FOLDERS: readonly string[] = [
	'node_modules',
	'dist',
	'.git',
	'coverage',
	'.corpora',
	'.worktrees',
	'.vitepress/cache',
]

/** Hook-folder files that are not a concern of the hook: tests, types, constants, barrels. */
export const NOT_A_CONCERN_FILE = /(\.test|\.types|\.constants|\.type)\.ts$|^index\.ts$/
