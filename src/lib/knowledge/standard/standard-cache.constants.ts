/** The manifest of a package, read where the command runs. */
export const PACKAGE_MANIFEST = 'package.json'

/** The hex characters of the installed hash a tags file is named with. */
export const INSTALLED_HASH_LENGTH = 16

/** The `name@version` list of the installed dialectes is hashed joined by this. */
export const INSTALLED_LIST_SEPARATOR = '\n'

/** The format of an index folder: part of the manifest hash, so a new format builds a new folder. */
export const INDEX_FORMAT = 2

/** The cache: `$XDG_CACHE_HOME/dialecte/`, else `~/.cache/dialecte/`; the indexes under `standard/<id>/`. */
export const CACHE_LOCATION = {
	environmentVariable: 'XDG_CACHE_HOME',
	homeVariable: 'HOME',
	homeFolder: '.cache',
	toolFolder: 'dialecte',
	standardFolder: 'standard',
} as const

/** The files of an index folder (the lines files and the tags file aside). */
export const INDEX_FILES = {
	manifest: 'manifest.json',
	quality: 'quality.json',
	headings: 'headings.json',
	definitions: 'definitions.json',
	tables: 'tables.json',
	crossReferences: 'crossrefs.json',
	words: 'words.json',
} as const

/** The files of an index folder that map each file id to its part. */
export const PER_FILE_PARTS = [
	'quality',
	'headings',
	'definitions',
	'tables',
	'crossReferences',
] as const

/** The folder of the logical lines files, one `<name>.jsonl` per file (name = the file id after its slash). */
export const LINES_FOLDER = 'lines'

export const LINES_EXTENSION = '.jsonl'

/** The separator of a file id: `<standard id>/<name>`. */
export const FILE_ID_SEPARATOR = '/'

/** A tags file: `tags-<installed hash>.json`. */
export const TAGS_FILE_PREFIX = 'tags-'

export const JSON_EXTENSION = '.json'

/** A folder or file being written: `<name>.tmp-<pid>`, renamed into place once complete. */
export const TEMPORARY_INFIX = '.tmp-'

/** An index folder a rebuild moved aside: `<hash>.old-<pid>`, removed once the new one is in place. */
export const ASIDE_INFIX = '.old-'

/** The pid of the process that left a temporary or an aside folder, read from its name. */
export const LEFT_FOLDER_PATTERN = /\.(?:tmp|old)-(\d+)$/u

/** How the manifest hash is shown in `--json`. */
export const MANIFEST_HASH_PREFIX = 'sha256:'

/** The rename of a folder onto one that another builder put in place first; any other code is a failure. */
export const TARGET_TAKEN_CODES: readonly string[] = ['ENOTEMPTY', 'EEXIST']

/** The folder a rebuild moves aside is gone already: another rebuild moved it. */
export const MISSING_ENTRY_CODE = 'ENOENT'

/** A rename into place that failed for another reason; `{...}` are filled in. */
export const PLACE_FAILED_MESSAGE =
	'cannot put the index in place: {code} renaming {from} to {to}; nothing kept'

/** How the running line of a build ends. */
export const BUILD_OUTCOMES = {
	built: 'built',
	reused: 'reused',
	aborted: 'aborted',
	failed: 'failed',
} as const

/** The build aborted because a file changed while it was read; `{...}` are filled in. */
export const FILE_CHANGED_MESSAGE =
	'{name} ({id}) changed while the index was built: nothing kept, run it again once the file is stable'

/** The running step's name while an index is built. */
export const BUILD_STEP_NAME = 'standard index'
