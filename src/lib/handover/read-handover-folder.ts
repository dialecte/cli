/** A hand-over folder read back: the lots file, and the files of each lot from the snapshot. */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { HANDOVER_FILES } from './handover.constants.ts'
import { isMergeLotPlan, lotPathCovers, readLotsFile } from './read-lots-file.ts'

import type { HandoverFolder, MergeLot } from './handover.types.ts'

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
	const mergesPath = join(absoluteFolder, HANDOVER_FILES.merges)
	const merges = existsSync(mergesPath)
		? (JSON.parse(readFileSync(mergesPath, 'utf8')) as Record<string, MergeLot>)
		: {}
	if (lotsFile.lots.some((lot, index) => isMergeLotPlan(lot) && !merges[index]))
		return `${absoluteFolder} misses the merge records (${HANDOVER_FILES.merges}): write it again with \`dialecte handover --rehash <lots.json>\``
	return {
		folder: absoluteFolder,
		lotsFile,
		lots: lotsFile.lots.map(function resolveLot(lot, index) {
			if (isMergeLotPlan(lot))
				return { message: lot.message, files: [], deletedFiles: [], merge: merges[index] }
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
		...(existsSync(join(absoluteFolder, HANDOVER_FILES.mergesHash)) && {
			mergesHash: readFileSync(join(absoluteFolder, HANDOVER_FILES.mergesHash), 'utf8').trim(),
		}),
	}
}

function readLines(path: string): string[] {
	return readFileSync(path, 'utf8').split('\n').filter(Boolean)
}
