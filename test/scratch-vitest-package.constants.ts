import { join } from 'node:path'

/** The cli's own vitest, linked into the scratch packages. */
export const VITEST_FOLDER = join(import.meta.dirname, '..', 'node_modules', 'vitest')
