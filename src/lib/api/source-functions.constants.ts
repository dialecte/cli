/** The cache of the source index, in the git folder. */
export const SOURCE_INDEX_FILE = 'dialecte-source-index.json'

/**
 * The schema of the cache: another number is a cache to rebuild. Bump it with any change of the cache's shape or of
 * what the parser answers for a file (a cache of another cli version is rebuilt anyway: its `reader` differs).
 */
export const SOURCE_INDEX_SCHEMA = 1

/** The folder of a package the source reader reads, relative to the package root. */
export const SOURCE_FOLDER = 'src'

/** The files of the source folder the reader parses: TypeScript, declaration files left out. */
export const SOURCE_FILE_PATTERN = /(?<!\.d)\.ts$/

/** What separates the file from the function's name in a source path (`src/lib/git.ts#readGit`): a path holding it is a source path. */
export const SOURCE_PATH_MARK = '#'

/** The JSDoc tag whose text lists the intents of a function. */
export const INTENT_TAG = 'intent'

/** The note of a package without a `src/` folder. */
export const NO_SOURCE_FOLDER_NOTE = 'no src/ folder in {root}'

/** The note of a file the parser cannot read: `{why}` is the parser's first error. */
export const NOT_PARSED_NOTE = '{file}: not parsed ({why})'

/** What a found source function prints in place of a summary when its JSDoc holds none. */
export const NO_SUMMARY_TEXT = '(no summary)'

/** What starts the line printing one note of the source reader, after the rows. */
export const NOTE_LINE_PREFIX = 'note: '

/** How many source paths `api show` names for a source path nobody declares. */
export const SOURCE_SUGGESTION_LIMIT = 5

/** The answer of `api show` for a source path nobody declares: `{closest}` the closest source paths. */
export const UNKNOWN_SOURCE_CLOSEST_TEXT =
	'no source function "{path}" in {root} - closest: {closest}'

/** The answer of `api show` for a source path nobody declares, none close to it. */
export const UNKNOWN_SOURCE_TEXT =
	'no source function "{path}" in {root}: `npx @dialecte/cli api find --source "<what you need>"` lists them'

/** The answer of a source lookup run with no package.json at or above `cwd`: `{command}` the lookup as typed. */
export const NO_PACKAGE_TEXT =
	'{command}: no package at {cwd}: run it inside a package (a folder holding a package.json, or below one)'
