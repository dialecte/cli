import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_PREFIXES } from './health.constants.ts'

import type { ScratchFolder } from './health.types.ts'

/**
 * The folders of `tmp` whose name starts with a scratch prefix of the cli, with their modification time, sorted by
 * name; files are left out, and a missing `tmp` reads as none.
 */
export function readScratchFolders(params: { tmp: string }): ScratchFolder[] {
	return listScratchNames({ tmp: params.tmp }).flatMap(function folderOf(name): ScratchFolder[] {
		const path = join(params.tmp, name)
		try {
			return [{ path, modifiedAt: statSync(path).mtime.toISOString() }]
		} catch {
			// removed between the listing and the read
			return []
		}
	})
}

/** The names of the folders of `tmp` a scratch prefix starts, sorted; none when `tmp` does not read. */
function listScratchNames(params: { tmp: string }): string[] {
	try {
		return readdirSync(params.tmp, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.filter((name) => SCRATCH_PREFIXES.some((prefix) => name.startsWith(prefix)))
			.sort()
	} catch {
		return []
	}
}
