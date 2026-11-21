/** Where the host seam scan draws its lines, as paths from the scanned root with `/`. */

/** The host folder: the generic host files, and one folder per vendor under it. */
export const HOST_FOLDER = 'src/lib/host'

/** The config folder: it reads of the host only `HOST_CONSTANTS_FILE`. */
export const CONFIG_FOLDER = 'src/lib/config'

/** The one host file the config folder may import. */
export const HOST_CONSTANTS_FILE = 'src/lib/host/host.constants.ts'

/** The generic host files that may import a vendor's folder: the vendor list, the contract list and the selection. */
export const VENDOR_IMPORTERS: readonly string[] = [
	'src/lib/host/host-vendors.constants.ts',
	'src/lib/host/host-contracts.constants.ts',
	'src/lib/host/select-host.ts',
]

/** The folders the noun scan reads: the sources and the test helpers, tests included. */
export const NOUN_FOLDERS: readonly string[] = ['src', 'test']

/** A vendor's contract fixtures live in `<this>/<name>/`, its own like its host folder. */
export const CONTRACT_FIXTURES_FOLDER = 'test/fixtures/host-contract'

/** The TypeScript files the noun scan parses (`.ts`, `.mts`, `.cts`, `.tsx`): declaration files left out. */
export const NOUN_FILE_PATTERN = /(?<!\.d)\.[cm]?tsx?$/

/**
 * Where an identifier splits into its words: any run of non-letters (`#`, `_`, `$`, digits), a lower letter before an
 * upper one, and an acronym's last capital before a capitalised word (`HTTPPull`: `HTTP`, `Pull`).
 */
export const IDENTIFIER_WORD_BOUNDARY = /[^A-Za-z]+|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/

/**
 * One vendor's change-request noun as a word of an identifier, in lower case: an identifier holding one of these words
 * spells it (`pullRequest`, `PULL_URL`, `#pull`, `Pulls`, the long noun as one word `pullrequest`); a word that only
 * starts with it (`pulled`, `pullover`) does not.
 */
export const VENDOR_NOUN_WORDS: readonly string[] = ['pull', 'pulls', 'pullrequest', 'pullrequests']

/**
 * The same noun in a file's path: `pull-request`, `pull_request`, `pullRequest`, in any case. Only the long form: the
 * short `pull` in a path names the `lot review --pull` flag (`pull-comments.ts`), whose word is decided with the verbs.
 */
export const VENDOR_NOUN_PATH_PATTERN = /pull[-_]?request/i
