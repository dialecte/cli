export type ConfigWorkspace = {
	/** The repository (the package root). */
	root: string
	/** A temporary home folder. */
	home: string
	/** Holds XDG_CONFIG_HOME, pointing at the folder of the personal file. */
	environment: Record<string, string>
	projectFile: string
	personalFile: string
	packageJsonFile: string
	dialecteJsonFile: string
	/** `forbidden-words` beside `personalFile`. */
	forbiddenWordsFile: string
}
