/** The package.json fields whose entries a published package carries to its registry. */
export const DEPENDENCY_FIELDS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
] as const

/**
 * The specs that name a folder or repository on the publisher's machine instead of a published version:
 * the protocols, and the bare folder paths npm reads as `file:` (relative, absolute, under the home folder).
 */
export const LOCAL_SPEC_PREFIXES = ['file:', 'link:', 'git+file:', './', '../', '/', '~/'] as const

/** The folder of the sources whose schemas the build ships. */
export const SCHEMA_SOURCE_FOLDER = 'src'

/** The ending of a schema file the build ships (`lot-risk.schema.json`). */
export const SCHEMA_FILE_SUFFIX = '.schema.json'

/** The folder of the output the schemas are copied into (`dist/schemas/<basename>`). */
export const SHIPPED_SCHEMAS_FOLDER = 'schemas'

/** Two schemas one basename would write to one shipped file: `{first}`, `{second}` their paths under the root. */
export const SHIPPED_SCHEMA_CLASH =
	'two schemas share one basename, one shipped file: {first} and {second}; rename one'
