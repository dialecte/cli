/** The exclusive paths (decision Q2): the lock files, never shared by two lots even when git merges them clean. */
import { basename } from 'node:path'

import { EXCLUSIVE_FILE_NAMES, TRAILING_SLASHES } from './forecast.constants.ts'

/** Whether a path, or a scope entry, names a lock file (by its file name, a trailing slash ignored). */
export function isExclusivePath(path: string): boolean {
	return EXCLUSIVE_FILE_NAMES.has(basename(path.replace(TRAILING_SLASHES, '')))
}
