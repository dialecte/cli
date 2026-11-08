/**
 * The folder rule's lot-folder decision, made from the path and the entries alone: no git process, so no
 * `node:child_process` in this module or what it imports.
 */
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { isFolder } from '../file-system.ts'
import { namesItself } from './store-folder.ts'
import { COMMON_FOLDER_FILE, COMMON_FOLDER_FOLDERS, STORE_FOLDER } from './store.constants.ts'

/**
 * The real path of `folder` when it is a lot folder: a direct child of a `dialecte-lots` folder of a git common
 * folder, holding a readable `identity.json` that names it (a `.tmp-` folder is none). Undefined for anything else,
 * a folder that does not exist included.
 */
export function lotFolderOf(params: { folder: string }): string | undefined {
	let real: string
	try {
		real = realpathSync(params.folder)
	} catch {
		return undefined
	}
	const store = dirname(real)
	if (basename(store) !== STORE_FOLDER || !isCommonFolder(dirname(store))) return undefined
	return namesItself({ store, name: basename(real) }) ? real : undefined
}

/** The folder holds what every git common folder holds: `HEAD`, `objects/` and `refs/`. */
function isCommonFolder(folder: string): boolean {
	if (!existsSync(join(folder, COMMON_FOLDER_FILE))) return false
	return COMMON_FOLDER_FOLDERS.every((name) => isFolder(join(folder, name)))
}
