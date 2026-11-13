import type { FactEffort, InstalledSchemas } from './facts.types.ts'

/** The facts ledger below the data folder. */
export const FACTS_SEGMENTS: readonly string[] = ['dialecte', 'facts']

/** The folder of the ledger holding one pointer file per key, and the extension of a fact and of its history. */
export const BY_KEY_FOLDER = 'by-key'
export const FACT_EXTENSION = '.json'
export const HISTORY_EXTENSION = '.history.jsonl'

/** The most bytes a history line holds, its final newline included. */
export const HISTORY_LINE_LIMIT = 4096

/** What a list member of a history line is renamed with when its length replaces it (`fromCount`, `toCount`). */
export const LIST_COUNT_SUFFIX = 'Count'

/** The mode a new history file is made with. */
export const HISTORY_FILE_MODE = 0o644

/** A fact id: `F-` and its number, padded to this many digits at least. */
export const FACT_ID_PREFIX = 'F-'
export const FACT_ID_DIGITS = 4

/** A fact file's name (its number captured), and a pointer's id (its text without the final newline). */
export const FACT_FILE_PATTERN = /^F-(\d+)\.json$/
export const FACT_ID_PATTERN = /^F-\d+$/

/** The rank of each effort: a higher one replaces a lower one. */
export const EFFORT_RANK: Readonly<Record<FactEffort, number>> = { low: 0, medium: 1, high: 2 }

/** A whitespace run in a question's normal form. */
export const QUESTION_WHITESPACE_PATTERN = /\s+/g

/** Why the command's check finds a source stale or unverifiable, and the fix; `{...}` are filled in. */
export const CHECK_REASONS = {
	standardChanged:
		'the files of standard {standard} changed since the fact was recorded: ask the question again to record it on the current files',
	standardNotComparable:
		'standard {standard} cannot be compared ({message}): set DIALECTE_STANDARD to the root folder holding {standard}',
	standardRootRefused: 'standard {standard} cannot be compared: {message}; {layout}',
	schemaChanged:
		'the definition of {package} changed since the fact was recorded: ask the question again to record it on the installed definition',
	schemaNotInstalled:
		'{package} is not installed in {cwd}: run the command from the package that installs {package}',
	schemaSkipped: '{package} could not be loaded ({message}): fix the package, then run again',
	noPackage:
		'no package.json in {cwd}, so no dialecte is installed there: run the command from the package that installs {package}',
	loadFailed:
		'the dialectes installed in {cwd} could not be loaded ({message}): fix the install, then run again',
	sourceMalformed: 'a {kind} source names no {member}: record the fact again',
	noStandardFolder: 'no folder {standard} under DIALECTE_STANDARD',
	schemaNotLoaded:
		'the dialectes were not loaded for this read (no fact read held a schema source when it started) so {package} cannot be compared: run the command again',
} as const

/** The installed dialectes of a check made without loading them: a schema source met anyway is unverifiable. */
export const SCHEMAS_NOT_LOADED: InstalledSchemas = {
	kind: 'none',
	template: CHECK_REASONS.schemaNotLoaded,
	message: '',
}

/** The kind of a source the installed dialectes are needed to compare. */
export const SCHEMA_SOURCE_KIND = 'schema'

/** The file whose absence means no dialecte is installed in the folder the command runs in. */
export const PACKAGE_MANIFEST = 'package.json'

/** The separator of the reasons of several sources. */
export const CHECK_REASON_SEPARATOR = '; '

/** The refusal of a facts folder inside a git work tree: the folder, the work tree's top and the fix. */
export const FACTS_WORK_TREE_REFUSAL =
	'the facts folder {path} is inside a git work tree ({top}): the facts ledger never lives in a repository; set {variable} to a folder outside the repository'
