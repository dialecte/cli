/** The corpora's cache folder. */
import { join } from 'node:path'

import { standardCacheRoot } from '../knowledge/standard/standard-cache-root.ts'
import { CORPORA_CACHE_FOLDER, CORPORA_FOLDER_VARIABLE } from './corpus.constants.ts'

/** `$DIALECTE_CORPORA_DIR` when set and not empty, else `corpora/` in the cli cache root (`standardCacheRoot`). */
export function corporaFolderOf(params: {
	environment: Readonly<Record<string, string | undefined>>
}): string {
	const given = params.environment[CORPORA_FOLDER_VARIABLE]
	if (given) return given
	return join(standardCacheRoot({ environment: { ...params.environment } }), CORPORA_CACHE_FOLDER)
}
