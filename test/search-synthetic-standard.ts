import { findInStandard } from '../src/lib/knowledge/standard/find-in-standard.ts'
/**
 * Builds search indexes from synthetic standards and runs find over them, so a test describes a
 * standard by blocks and reads the slices find answers. Reuses the generator of the indexing tests.
 */
import { indexStandardText } from '../src/lib/knowledge/standard/index-standard-text.ts'
import { searchIndexOf } from '../src/lib/knowledge/standard/search-index-of.ts'
import { EMPTY_VOCABULARY, PADDING_FILE } from './search-synthetic-standard.constants.ts'
import { SYNTHETIC_FILE_ID } from './synthetic-standard.constants.ts'
import { buildSyntheticStandard } from './synthetic-standard.ts'

import type { StandardFileIndex } from '../src/lib/knowledge/standard/standard-index.types.ts'
import type {
	StandardSearchIndex,
	StandardSlice,
	StandardVocabulary,
} from '../src/lib/knowledge/standard/standard-search.types.ts'
import type { SyntheticFile } from './search-synthetic-standard.types.ts'
import type { SyntheticBlock } from './synthetic-standard.types.ts'

/** The synthetic file described by `file`, indexed under its id. */
export function indexSyntheticFile(params: { file: SyntheticFile }): StandardFileIndex {
	return indexStandardText({
		fileId: params.file.fileId ?? SYNTHETIC_FILE_ID,
		text: buildSyntheticStandard({ blocks: params.file.blocks }),
	})
}

/** The search index of one standard made of `files`. */
export function searchSynthetic(params: {
	files: SyntheticFile[]
	vocabulary?: StandardVocabulary
}): StandardSearchIndex {
	return searchIndexOf({
		files: params.files.map((file) => indexSyntheticFile({ file })),
		vocabulary: params.vocabulary ?? EMPTY_VOCABULARY,
	})
}

/** Find over standards (one list of files each), every index built with the same vocabulary. */
export function findSynthetic(params: {
	standards: SyntheticFile[][]
	vocabulary?: StandardVocabulary
	query: string
	about?: string
	limit?: number
}): StandardSlice[] {
	const indexes = params.standards.map((files) =>
		searchSynthetic({ files, vocabulary: params.vocabulary }),
	)
	return findInStandard({
		indexes,
		query: params.query,
		about: params.about,
		limit: params.limit,
	})
}

/** The blocks of a standard of one file, for a case that needs no other. */
export function singleFile(blocks: SyntheticBlock[]): SyntheticFile[][] {
	return [[{ blocks }]]
}

/** Each text its own logical line: the text, then a blank line. */
export function separatedLines(texts: string[]): SyntheticBlock[] {
	return texts.flatMap((text): SyntheticBlock[] => [
		{ kind: 'raw', lines: [text] },
		{ kind: 'blank' },
	])
}

/** Each text one code line (starts with `<`), so each is a logical line with no blank between. */
export function codeLines(texts: string[]): SyntheticBlock[] {
	return texts.map((text): SyntheticBlock => ({ kind: 'raw', lines: [`<${text}/>`] }))
}

/**
 * A standard of one file followed by a padding file of unrelated logical lines: it keeps a word held by
 * a few lines under the 5 % of the standard's logical lines above which a word is scored low, so the
 * scores of a case are the plain ones.
 */
export function padded(blocks: SyntheticBlock[]): SyntheticFile[][] {
	return [[{ blocks }, PADDING_FILE]]
}

/** The padding file under another id, so that each standard of a case has a padding file of its own. */
export function paddingFileOf(params: { fileId: string }): SyntheticFile {
	return { ...PADDING_FILE, fileId: params.fileId }
}
