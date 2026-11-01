import type { SourceExtension } from './export-entries.types.ts'

/** The folder an entry's source lives in: the build folder of its `types` path is replaced by it. */
export const SOURCE_FOLDER = 'src'

/** The declaration file an entry ships, and the extension of the source it is built from. */
export const SOURCE_EXTENSIONS: readonly SourceExtension[] = [
	{ declaration: '.d.ts', source: '.ts' },
	{ declaration: '.d.mts', source: '.mts' },
	{ declaration: '.d.cts', source: '.cts' },
]

/**
 * The source extension tried after the matching one: a dual build (tsup) emits `.d.mts` and `.d.cts` from a
 * `.ts` source.
 */
export const FALLBACK_SOURCE_EXTENSION = '.ts'

/** A subpath or target holding it is a file pattern (`./test/xsd/*`), not a code entry. */
export const SUBPATH_PATTERN_MARKER = '*'
