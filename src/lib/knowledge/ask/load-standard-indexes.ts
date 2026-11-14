import { readCliVersion } from '../../read-cli-version.ts'
import { ensureStandardIndex } from '../standard/ensure-standard-index.ts'
import {
	emptyInstalledVocabulary,
	readInstalledVocabulary,
} from '../standard/read-installed-vocabulary.ts'
import { workTreeRefusal } from '../standard/read-standard-input.ts'
import { standardCacheRoot } from '../standard/standard-cache-root.ts'
import { standardFolderFilesKey } from '../standard/standard-files-key.ts'
import { isReadableFolder, selectedFoldersOf } from './selected-folders-of.ts'

import type { StandardInstalledVocabularyAnswer } from '../standard/standard-cache.types.ts'
import type {
	LoadedStandardIndexes,
	LoadedStandards,
	LoadStandardIndexesParams,
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
		installed,
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
		loaded.standard.folders.push({
			id: standard.id,
			files: standardFolderFilesKey({ standard }),
		})
	}
	return loaded
}

/** The installed vocabulary (of `packageName` only, when given), or an empty one when the load reads none. */
async function vocabularyOf(
	params: LoadStandardIndexesParams,
): Promise<StandardInstalledVocabularyAnswer> {
	if (params.readVocabulary === false)
		return { kind: 'read', installed: emptyInstalledVocabulary() }
	return readInstalledVocabulary({ cwd: params.cwd, packageName: params.packageName })
}
