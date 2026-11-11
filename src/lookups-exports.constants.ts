import { join } from 'node:path'

/** The package folder and the library entry's source. */
export const PACKAGE_FOLDER = join(import.meta.dirname, '..')
export const LOOKUPS_ENTRY = join(PACKAGE_FOLDER, 'src', 'lookups.ts')

/** The types a consumer of the entry names: the printed text and the output that holds it. */
export const TYPE_EXPORTS = ['PrintedText', 'CommandOutput'] as const
