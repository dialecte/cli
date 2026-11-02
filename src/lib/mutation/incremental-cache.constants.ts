/** Stryker's incremental file inside a run's work folder. */
export const INCREMENTAL_FILE_NAME = 'incremental.json'

/** The folder of the cached incremental files, under the mutation store. */
export const INCREMENTAL_STORE_FOLDER = 'incremental'

/** Hashed in place of an input file that does not exist (an unbuilt ignorer). */
export const MISSING_KEY_INPUT = 'dialecte-missing-key-input'

/**
 * The fast tier's option fields left out of the key: they differ per run (the targets, the report and temp
 * folders, the config and incremental files) or per worktree (the plugin list carries the ignorer's absolute path;
 * the ignorer's bytes and the cli version stand for it).
 */
export const KEY_EXCLUDED_OPTION_FIELDS = [
	'mutate',
	'jsonReporter',
	'tempDirName',
	'configFile',
	'incrementalFile',
	'plugins',
] as const

/** How many incremental files of one package the store keeps (the newest by modification time). */
export const INCREMENTAL_FILES_KEPT_PER_PACKAGE = 4

/** How many hex characters of the package path's hash prefix a stored file's name. */
export const PACKAGE_HASH_LENGTH = 16
