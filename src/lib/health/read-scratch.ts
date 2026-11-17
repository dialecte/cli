import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import { SCRATCH_MARKER_FILE } from '../scratch/scratch.constants.ts'
import { SCRATCH_PREFIXES } from './health.constants.ts'

import type { ScratchFolder } from './health.types.ts'

/**
 * The cli's scratch folders with their modification time: in the scratch root `root`, each folder holding a
 * `scratch.json` or named with a scratch prefix; in the temporary folder `tmp`, where earlier versions made them,
 * each folder named with a scratch prefix. Sorted by name within each folder, a folder read once; files are left out,
 * and a missing folder reads as none.
 */
export function readScratchFolders(params: { root?: string; tmp: string }): ScratchFolder[] {
	const inRoot =
		params.root === undefined
			? []
			: listFolderNames(params.root)
					.map((name) => join(params.root ?? '', name))
					.filter((path) => existsSync(join(path, SCRATCH_MARKER_FILE)) || isPrefixed(path))
	const inTemporary = listFolderNames(params.tmp)
		.map((name) => join(params.tmp, name))
		.filter((path) => isPrefixed(path))
	return [...new Set([...inRoot, ...inTemporary])].flatMap(
		function folderOf(path): ScratchFolder[] {
			try {
				return [{ path, modifiedAt: statSync(path).mtime.toISOString() }]
			} catch {
				// removed between the listing and the read
				return []
			}
		},
	)
}

/** The folder's name starts with a scratch prefix of the cli. */
function isPrefixed(path: string): boolean {
	const name = basename(path)
	return SCRATCH_PREFIXES.some((prefix) => name.startsWith(prefix))
}

/** The names of the folders in `folder`, sorted; none when it does not read. */
function listFolderNames(folder: string): string[] {
	try {
		return readdirSync(folder, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort()
	} catch {
		return []
	}
}
