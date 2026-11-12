/**
 * The folder rule's lot-folder decision, made from the path and the entries alone: no git process, so no
 * `node:child_process` in this module or what it imports.
 */
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { isFolder, realPathThroughAncestors } from '../file-system.ts'
import { namesItself } from './store-folder.ts'
import {
	COMMON_FOLDER_FILE,
	COMMON_FOLDER_FOLDERS,
	LOT_FOLDER_NAME_PATTERN,
	STORE_FOLDER,
	TEMPORARY_FOLDER_PATTERN,
} from './store.constants.ts'

/**
 * The real path of `folder` when it is a lot folder: a direct child of a `dialecte-lots` folder of a git common
 * folder, holding a readable `identity.json` that names it (a `.tmp-` folder is none). Undefined for anything else,
 * a folder that does not exist included.
 */
export function lotFolderOf(params: { folder: string }): string | undefined {
	const real = realStoreChildOf(params)
	if (real === undefined) return undefined
	return namesItself({ store: dirname(real), name: basename(real) }) ? real : undefined
}

/**
 * The real path of `folder` when it is an entry of a store with a lot name's shape, whatever its records hold (its
 * identity may not read: a damaged lot). Undefined for anything else, a `.tmp-` folder and a missing folder included.
 */
export function storeEntryOf(params: { folder: string }): string | undefined {
	const real = realStoreChildOf(params)
	return real !== undefined && LOT_FOLDER_NAME_PATTERN.test(basename(real)) ? real : undefined
}

/** The real path of `folder` when it is a direct child of a `dialecte-lots` folder of a git common folder. */
function realStoreChildOf(params: { folder: string }): string | undefined {
	let real: string
	try {
		real = realpathSync(params.folder)
	} catch {
		return undefined
	}
	const store = dirname(real)
	return isStoreFolder(store) ? real : undefined
}

/**
 * The lot `folder`'s path names: its name when it sits directly under a `dialecte-lots` folder of a git common folder
 * (a `.tmp-` folder is none), whether it still exists or not and without reading its identity. Undefined else.
 */
export function lotNameOfPath(params: { folder: string }): string | undefined {
	const real = realPathThroughAncestors(resolve(params.folder))
	if (!isStoreFolder(dirname(real))) return undefined
	const name = basename(real)
	return TEMPORARY_FOLDER_PATTERN.test(name) ? undefined : name
}

/** The folder is a store: a `dialecte-lots` folder of a git common folder. */
function isStoreFolder(store: string): boolean {
	return basename(store) === STORE_FOLDER && isCommonFolder(dirname(store))
}

/** The folder holds what every git common folder holds: `HEAD`, `objects/` and `refs/`. */
export function isCommonFolder(folder: string): boolean {
	if (!existsSync(join(folder, COMMON_FOLDER_FILE))) return false
	return COMMON_FOLDER_FOLDERS.every((name) => isFolder(join(folder, name)))
}
