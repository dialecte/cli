import { indexStandardText } from '../src/lib/knowledge/standard/index-standard-text.ts'
import { SYNTHETIC_FILE_ID } from './synthetic-standard.constants.ts'
import { buildSyntheticStandard } from './synthetic-standard.ts'

import type { StandardFileIndex } from '../src/lib/knowledge/standard/standard-index.types.ts'
import type { SyntheticBlock } from './synthetic-standard.types.ts'

/** The synthetic standard described by `blocks`, indexed under the synthetic file id. */
export function indexSynthetic(params: { blocks: SyntheticBlock[] }): StandardFileIndex {
	return indexStandardText({ fileId: SYNTHETIC_FILE_ID, text: buildSyntheticStandard(params) })
}

/** The id a heading or table of the synthetic file has: `<file id>#<suffix>`. */
export function syntheticId(suffix: string): string {
	return `${SYNTHETIC_FILE_ID}#${suffix}`
}
