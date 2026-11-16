/** Names and messages of the corpora: the cache layout (kept from create's fetch), the manifest's required fields. */

/** The environment variable naming the cache folder (a CI cache, a test); else the cli cache root's `corpora/`. */
export const CORPORA_FOLDER_VARIABLE = 'DIALECTE_CORPORA_DIR'

/** The corpora's folder inside the cli cache root. */
export const CORPORA_CACHE_FOLDER = 'corpora'

/** The kept downloads, one file per URL named by the sha256 of the URL: a run without network rebuilds from them. */
export const DOWNLOADS_FOLDER = '_downloads'

/** What the cache holds, by source id. */
export const LOCK_FILE = 'manifest.lock.json'

/** The shipped manifest and override folder, beside the module in the sources and under `corpus/` beside the bundle. */
export const MANIFEST_FILE = 'manifest.json'
export const OVERRIDES_FOLDER = 'overrides'
export const SHIPPED_CORPUS_FOLDER = 'corpus'

/** The fields that record a source's licence review: a source without one is never fetched. */
export const REQUIRED_SOURCE_FIELDS = ['license', 'terms', 'verdict'] as const

/** The verdict of a licensed entry of config.yml: its schemas are read, never mutated. */
export const LICENSED_VERDICT = 'schemas-only'

/** The staging folder of a source's tree while it is built, beside its final folder. */
export const STAGING_SUFFIX = '.staging'

/** The ustar block and the offsets of its header fields. */
export const TAR_BLOCK = 512
export const TAR_HEADER = {
	name: [0, 100],
	size: [124, 12],
	checksum: [148, 8],
	type: [156, 1],
	magic: [257, 6],
	prefix: [345, 155],
} as const
/** The byte a checksum field counts as while the header's sum is taken. */
export const TAR_CHECKSUM_SPACE = 0x20
/** Tar entry types: a regular file, a pax header (its `path=` names the next entry), a GNU long name. */
export const TAR_TYPES = { file: ['0', '\0', ''], pax: 'x', longName: 'L' } as const
export const PAX_PATH_KEY = 'path'

/** The gzip magic bytes. */
export const GZIP_MAGIC = [0x1f, 0x8b] as const

/** Zip signatures and the offsets the reader uses. */
export const ZIP_SIGNATURES = {
	local: 0x04034b50,
	central: 0x02014b50,
	end: 0x06054b50,
} as const
export const ZIP_END_SIZE = 22
export const ZIP_END_COMMENT_MAX = 0xffff
export const ZIP_METHODS = { stored: 0, deflated: 8 } as const

/** The written wrapper schema around the documents it imports. */
export const XSD_NAMESPACE = 'http://www.w3.org/2001/XMLSchema'
export const WRAPPER_HEADER =
	'<?xml version="1.0" encoding="UTF-8"?>\n<!-- written by dialecte corpus fetch (MIT): reads the documents below together -->\n'

/** The root element of a schema document and its target namespace. */
export const SCHEMA_ROOT_PATTERN = /<(?:[\w.-]+:)?schema\b[^>]*>/u
export const TARGET_NAMESPACE_PATTERN = /\btargetNamespace\s*=\s*(["'])(.*?)\1/u

/** The messages of a refused source or a problem. */
export const CORPUS_MESSAGES = {
	missingField:
		'{id}: no {fields} in the manifest - a source is fetched only once its licence is reviewed',
	missingPin: '{id}: {url} has no sha256 in the manifest - pin it and review it before fetching',
	shaMismatch: '{id}: {url} has sha256 {actual}, not the pinned {expected} - the source changed',
	downloadFailed: '{id}: {url} could not be downloaded ({reason})',
	refusedPath: '{id}: refused path in a downloaded source: {path}',
	unknownArchive: '{id}: {url} is neither a tar, a tar.gz nor a zip archive',
	unsupportedZip: '{id}: {url} uses a zip feature the reader does not support ({reason})',
	unknownOverride: '{id}: no override file {override}',
	wrapperUnmatched: '{id}: wrapper {path} - nothing matches {pattern}',
	editedFile: '{id}: {path} does not match its fetched sha256',
	missingFile: '{id}: {path} is missing from the cache',
	extraFile: '{id}: {path} was not fetched',
	staleSource: '{id}: fetched from another manifest entry - run dialecte corpus fetch {id}',
	licensedMissing: '{id}: {path} is missing',
} as const

/** The characters a glob's literal text escapes in its regular expression. */
export const FNMATCH_SPECIAL_PATTERN = /[.+^${}()|\\\]]/gu

/** The user agent of the downloads. */
export const CORPUS_USER_AGENT = 'dialecte-corpus/1 (+https://github.com/dialecte/cli)'

/** A source id names one folder of the cache: no separator, no climbing, never the downloads folder. */
export const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u
export const BAD_SOURCE_ID =
	'{id}: a source id is one folder name (letters, digits, dot, dash, underscore)'

/** The glob of a licensed instances folder: every file under it (the manifest's globs, where `*` crosses folders). */
export const LICENSED_INSTANCE_GLOB = '*'

/** How long a download may go without receiving anything, as create's per-read timeout allowed. */
export const DOWNLOAD_TIMEOUT_MILLISECONDS = 120_000

/** A source whose tree could not be built from its checked downloads. */
export const UNBUILT_SOURCE = '{id}: could not be built ({reason})'

/** Why an idle download was aborted. */
export const IDLE_DOWNLOAD = 'no data for {milliseconds} ms'
