import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { readCliVersion } from '../../read-cli-version.ts'
import { ensureStandardIndex } from '../standard/ensure-standard-index.ts'
import {
	emptyInstalledVocabulary,
	readInstalledVocabulary,
} from '../standard/read-installed-vocabulary.ts'
import { workTreeRefusal } from '../standard/read-standard-input.ts'
import { standardCacheRoot } from '../standard/standard-cache-root.ts'
import { standardFilesKey } from '../standard/standard-files-key.ts'
import { LINE_BREAK_PATTERN } from '../standard/standard-index.constants.ts'
import { SETUP_HASH_ALGORITHM, SETUP_HASH_ENCODING } from './ask.constants.ts'
import { isReadableFolder, selectedFoldersOf } from './selected-folders-of.ts'

import type { StandardInstalledVocabularyAnswer } from '../standard/standard-cache.types.ts'
import type { StandardFolder } from '../standard/standard-input.types.ts'
import type { StandardSearchIndex } from '../standard/standard-search.types.ts'
import type {
	LoadedStandardIndexes,
	LoadedStandards,
	LoadStandardIndexesParams,
	StandardFileRead,
} from './ask.types.ts'

/**
 * The selected standards' search indexes (built in the cache when missing), each folder's files key and the
 * installed vocabulary; or a refusal (exit 2: the root, a folder, an id the root does not hold, a cache inside a
 * git work tree, a `packageName` not installed, the caller's vocabulary check), or an aborted build (exit 1). A
 * folder holding no `.md` file is skipped. The one loading path of `standard` and `ask`. Writes a missing or
 * outdated index to the index cache.
 *
 * @intent load the search indexes of standard folders, build the index of the standard text
 */
export async function loadStandardIndexes(
	params: LoadStandardIndexesParams,
): Promise<LoadedStandardIndexes> {
	const { environment } = params
	const selected = selectedFoldersOf({ environment, standardIds: params.standardIds })
	if (selected.kind === 'refused') return selected
	const cacheRoot = standardCacheRoot({ environment })
	const cacheRefusal = workTreeRefusal({ path: cacheRoot })
	if (cacheRefusal) return { kind: 'refused', message: cacheRefusal }
	const vocabulary = await vocabularyOf(params)
	if (vocabulary.kind === 'unknownPackage') return vocabulary
	const { installed } = vocabulary
	const vocabularyRefusal = params.checkVocabulary?.({ installed })
	if (vocabularyRefusal) return { kind: 'refused', message: vocabularyRefusal }
	const cliVersion = readCliVersion()
	const loaded: LoadedStandards = {
		kind: 'loaded',
		standard: { kind: 'documents', indexes: [], folders: [] },
		ready: [],
		skipped: [],
		manifest: [],
		installed,
		originalLines: new Map(),
	}
	for (const standard of selected.folders) {
		if (!isReadableFolder({ folder: standard })) {
			loaded.skipped.push(standard)
			continue
		}
		const answer = await ensureStandardIndex({
			standard,
			cacheRoot,
			installed,
			rebuild: params.rebuild ?? false,
			cliVersion,
			progress: params.progress,
			afterFileRead: params.afterFileRead,
		})
		if (answer.kind === 'aborted') return answer
		loaded.ready.push(answer.index)
		loaded.standard.indexes.push(answer.index.search)
		const read = filesReadOf({ standard, search: answer.index.search })
		const manifest = read.map((entry) => entry.manifest)
		loaded.manifest.push(...manifest)
		for (const entry of read) loaded.originalLines.set(entry.manifest.id, entry.lines)
		loaded.standard.folders.push({ id: standard.id, files: standardFilesKey({ files: manifest }) })
	}
	return loaded
}

/**
 * Each file of a folder as its bytes are now: its id, sha256 and original line count (from its index), with its
 * original lines from the same bytes (a cite's range reads them, R1-9).
 */
function filesReadOf(params: {
	standard: StandardFolder
	search: StandardSearchIndex
}): StandardFileRead[] {
	return params.standard.files.map(function fileReadOf(file): StandardFileRead {
		const bytes = readFileSync(file.path)
		return {
			manifest: {
				id: file.id,
				sha256: createHash(SETUP_HASH_ALGORITHM).update(bytes).digest(SETUP_HASH_ENCODING),
				lines: params.search.files.find((index) => index.fileId === file.id)?.lineCount ?? 0,
			},
			lines: bytes.toString('utf8').split(LINE_BREAK_PATTERN),
		}
	})
}

/** The installed vocabulary (of `packageName` only, when given), or an empty one when the load reads none. */
async function vocabularyOf(
	params: LoadStandardIndexesParams,
): Promise<StandardInstalledVocabularyAnswer> {
	if (params.readVocabulary === false)
		return { kind: 'read', installed: emptyInstalledVocabulary() }
	return readInstalledVocabulary({ cwd: params.cwd, packageName: params.packageName })
}
