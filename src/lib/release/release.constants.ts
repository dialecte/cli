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
