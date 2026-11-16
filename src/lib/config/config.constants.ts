import { PACKAGE_JSON_FILE_NAME } from './find-old-homes.constants.ts'

/** The file of the project layer, at the package root. */
export const PROJECT_CONFIG_FILE_NAME = '.dialecterc'

/** The markers of the package root a config call reads `.dialecterc` in, searched from the folder it runs in up. */
export const CONFIG_ROOT_MARKERS: readonly string[] = [
	PROJECT_CONFIG_FILE_NAME,
	PACKAGE_JSON_FILE_NAME,
]

/** The folder of the personal layer inside the configuration folder of the machine. */
export const PERSONAL_CONFIG_FOLDER_NAME = 'dialecte'

/** The file of the personal layer inside its folder. */
export const PERSONAL_CONFIG_FILE_NAME = 'config.yml'

/** The one schema version both files carry. */
export const CONFIG_SCHEMA_VERSION = 1

/** The top-level key holding the schema version (not an entry). */
export const CONFIG_SCHEMA_KEY = 'schema'

/** The personal top-level key holding the per-repository overrides. */
export const CONFIG_REPOS_KEY = 'repos'

/** A URL scheme, `git+` forms included (`https://`, `ssh://`, `git+https://`). */
export const REMOTE_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/** A `file://` URL, a local origin compared as a path. */
export const FILE_URL_SCHEME = /^file:\/\//i

/** The leading slash before a drive letter in a `file://` URL's path (`/C:/x`): the drive. */
export const FILE_URL_DRIVE = /^\/([a-zA-Z]:)/

/** The scp form of a remote, `user@host:path`: the host and the path. */
export const REMOTE_SCP_FORM = /^(?:[^@/]+@)?([^:/]+):(.*)$/

/** The platforms whose file systems compare paths whatever the case. */
export const CASE_FOLDING_PLATFORMS: readonly NodeJS.Platform[] = ['win32', 'darwin']

/** How a problem names the file of each layer. */
export const CONFIG_LAYER_FILE_LABELS: Readonly<Record<'project' | 'personal', string>> = {
	project: '.dialecterc',
	personal: 'the personal config.yml',
}

/** The rank of each file source when one key has values in several (the highest wins whole, D5). */
export const CONFIG_SOURCE_RANKS: readonly ('repo' | 'personal' | 'project')[] = [
	'repo',
	'personal',
	'project',
]

/** Both layers, the default of `resolveConfig`. */
export const CONFIG_LAYERS: readonly ('project' | 'personal')[] = ['project', 'personal']

/** A second `repos:` entry naming a repository an earlier one names (D14): `{repo}` its key. */
export const DUPLICATE_REPOS_ENTRY_PROBLEM =
	"repos entry '{repo}' names the same repository as an earlier entry: only the first is used"
