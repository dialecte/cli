/** The word the sample standards hold in their second clause: the query that finds them. */
export const SAMPLE_WORD = 'zorbit'

/** The word of the valid standard the decoy `DIALECTE_STANDARD` of the process environment holds. */
export const DECOY_WORD = 'decoyword'

/** The manifest's format number the index folder is hashed with. */
export const INDEX_FORMAT = 2

/** Every file an index folder holds, besides the `lines/` files and the tags file. */
export const INDEX_FOLDER_FILES = [
	'crossrefs.json',
	'definitions.json',
	'headings.json',
	'manifest.json',
	'quality.json',
	'tables.json',
	'words.json',
] as const

/** The tags file of an index folder: `tags-<first 16 hex of the installed hash>.json`. */
export const TAGS_FILE_PATTERN = /^tags-[0-9a-f]{16}\.json$/u

/**
 * The tags files of the test dialecte installed as `@acme/widget` in version 1.0.0 and 2.0.0: the first 16 hex
 * of the sha256 of the sorted `name@version` list joined by a line feed (one name, so just `@acme/widget@<v>`),
 * written out as the literals the formula gives.
 */
export const TAGS_FILE_VERSION_ONE = 'tags-df80627a314b90de.json'
export const TAGS_FILE_VERSION_TWO = 'tags-9c5025f60d5f8320.json'

/** The tags file of `@acme/gadget@1.0.0` and `@acme/widget@1.0.0` installed together (the sorted list, joined by a line feed). */
export const TAGS_FILE_BOTH_PACKAGES = 'tags-2c508b780cfbfefa.json'

/** The words the refusal of `--about` with no installed dialecte holds. */
export const ABOUT_NEEDS_DIALECTE = 'needs an installed dialecte'

/** The sentence the expected-layout message of a refused root holds. */
export const LAYOUT_MARKER = 'one folder per standard'

/** The words the refusal of a path inside a git work tree holds. */
export const WORK_TREE_MARKER = 'inside a git work tree'

/** The four verbs, as the usage of an unknown verb names them. */
export const STANDARD_VERBS = ['index', 'find', 'show', 'eval'] as const

/** A 64-character hex hash, as a manifest folder is named. */
export const HASH_PATTERN = /^[0-9a-f]{64}$/u

/** The characters of a manifest hash the `index` line prints. */
export const SHORT_HASH_LENGTH = 12

/** The cache folder a standard's index folders live in, under the cache root. */
export const CACHE_STANDARD_PATH = ['dialecte', 'standard'] as const

/** The entry that makes a folder the top of a git work tree (a folder, or a file in a linked work tree). */
export const GIT_FOLDER = '.git'
