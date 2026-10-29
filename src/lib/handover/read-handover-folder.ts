/** A hand-over folder read back: the lots file, and the files of each lot from the snapshot. */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { HANDOVER_FILES } from './handover.constants.ts'
import { lotPathCovers, readLotsFile } from './read-lots-file.ts'

import type { HandoverFolder } from './handover.types.ts'

/** The folder, or what is wrong with it. */
export function readHandoverFolder(folder: string): HandoverFolder | string {
	const absoluteFolder = resolve(folder)
	const lotsFile = readLotsFile(join(absoluteFolder, HANDOVER_FILES.lots))
	if (typeof lotsFile === 'string') return lotsFile
	const missing = [
		HANDOVER_FILES.files,
		HANDOVER_FILES.hashes,
		HANDOVER_FILES.deleted,
		HANDOVER_FILES.lotsHash,
	].filter((name) => !existsSync(join(absoluteFolder, name)))
	if (missing.length)
		return `${absoluteFolder} misses ${missing.join(', ')}: write it with \`dialecte handover <lots.json>\``
	const files = readLines(join(absoluteFolder, HANDOVER_FILES.files))
	const deleted = new Set(readLines(join(absoluteFolder, HANDOVER_FILES.deleted)))
	return {
		folder: absoluteFolder,
		lotsFile,
		lots: lotsFile.lots.map(function resolveLot(lot) {
			const covered = files.filter((file) =>
				lot.paths.some((path) => lotPathCovers({ path, file })),
			)
			return {
				message: lot.message,
				files: covered.filter((file) => !deleted.has(file)),
				deletedFiles: covered.filter((file) => deleted.has(file)),
			}
		}),
		snapshotLines: readLines(join(absoluteFolder, HANDOVER_FILES.hashes)),
		lotsHash: readFileSync(join(absoluteFolder, HANDOVER_FILES.lotsHash), 'utf8').trim(),
	}
}

function readLines(path: string): string[] {
	return readFileSync(path, 'utf8').split('\n').filter(Boolean)
}
