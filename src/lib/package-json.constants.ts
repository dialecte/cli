import type { DeclaredSpec } from './package-json.types.ts'

/** A package's manifest file name. */
export const PACKAGE_MANIFEST_FILE = 'package.json'

/** The dependency fields a package declares another package in, in the order a declared spec is read from. */
export const DECLARING_FIELDS: ReadonlyArray<DeclaredSpec['field']> = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
]
