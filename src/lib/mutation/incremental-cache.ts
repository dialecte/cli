import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import {
	INCREMENTAL_FILES_KEPT_PER_PACKAGE,
	INCREMENTAL_STORE_FOLDER,
} from './incremental-cache.constants.ts'
import { mutationStoreFolderOf, writeAtomically } from './run-store.ts'

/**
 * The path of the stored incremental file of a package and key:
 * `<git-common-dir>/dialecte-mutation/incremental/<packageHash>-<key>.json`, the same from every worktree.
 *
 * @intent find where a mutation run's cached incremental file lives
 * @internal
 */
export function incrementalCachePathOf(params: {
	root: string
	packageHash: string
	key: string
}): string {
	return join(storeFolderOf(params.root), `${params.packageHash}-${params.key}.json`)
}

/**
 * Copies the stored file of the package and key, when it parses as JSON, to `incrementalFile` (`warm`); with no
 * file, one that does not parse or one removed meanwhile nothing is copied (`cold`).
 *
 * @intent start a mutation run from the cached incremental file of its tree
 * @internal
 */
export function seedIncrementalFile(params: {
	root: string
	packageHash: string
	key: string
	incrementalFile: string
}): 'warm' | 'cold' {
	const text = readParsableText(incrementalCachePathOf(params))
	if (text === undefined) return 'cold'
	mkdirSync(dirname(params.incrementalFile), { recursive: true })
	writeFileSync(params.incrementalFile, text)
	return 'warm'
}

/**
 * Writes the work-folder file, when it exists and parses as JSON, to the store atomically (`true`), then removes
 * the package's files beyond the newest `INCREMENTAL_FILES_KEPT_PER_PACKAGE`, never the one just written; a
 * missing or unparsable file leaves the store unchanged and evicts nothing (`false`).
 *
 * @intent keep the incremental file a reported mutation run wrote for the next run on the same tree
 * @internal
 */
export function storeIncrementalFile(params: {
	root: string
	packageHash: string
	key: string
	incrementalFile: string
}): boolean {
	const text = readParsableText(params.incrementalFile)
	if (text === undefined) return false
	const path = incrementalCachePathOf(params)
	mkdirSync(dirname(path), { recursive: true })
	writeAtomically({ path, text })
	evictOldFiles({ folder: dirname(path), packageHash: params.packageHash, kept: path })
	return true
}

function storeFolderOf(root: string): string {
	return join(mutationStoreFolderOf(root), INCREMENTAL_STORE_FOLDER)
}

/** Removes the package's files beyond the newest ones (by modification time, ties: the greater name is newer), `kept` always staying. */
function evictOldFiles(params: { folder: string; packageHash: string; kept: string }): void {
	const { folder, packageHash, kept } = params
	const prefix = `${packageHash}-`
	const files = readdirSync(folder)
		.filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
		.map((name) => ({
			name,
			path: join(folder, name),
			modified: modifiedTimeOf(join(folder, name)),
		}))
		.filter(
			(file): file is { name: string; path: string; modified: number } =>
				file.modified !== undefined,
		)
		.filter((file) => file.path !== kept)
		.sort((first, second) =>
			first.modified !== second.modified
				? second.modified - first.modified
				: first.name < second.name
					? 1
					: -1,
		)
	for (const old of files.slice(INCREMENTAL_FILES_KEPT_PER_PACKAGE - 1))
		rmSync(old.path, { force: true })
}

/** The modification time of a file, or undefined when it vanished. */
function modifiedTimeOf(path: string): number | undefined {
	try {
		return statSync(path).mtimeMs
	} catch {
		return undefined
	}
}

/** The text of the file at `path` when it exists and parses as JSON; else undefined. */
function readParsableText(path: string): string | undefined {
	if (!existsSync(path)) return undefined
	try {
		const text = readFileSync(path, 'utf8')
		JSON.parse(text)
		return text
	} catch {
		return undefined
	}
}
