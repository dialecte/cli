/** How a test file names a helper when it imports it or reads it by name: what a search by text looks for first. */
import { basename, dirname } from 'node:path'

import { INDEX_MODULE_NAME, MODULE_EXTENSION_PATTERN } from './tdd.constants.ts'

/** The helper's file name without extension; its folder's name for an `index` (imported by its folder). */
export function writtenNameOf(helper: string): string {
	const name = basename(helper).replace(MODULE_EXTENSION_PATTERN, '')
	return name === INDEX_MODULE_NAME ? basename(dirname(helper)) : name
}
