import { tagLinksOf } from './tag-links-of.ts'
import { unitsOf } from './units-of.ts'
import { wordIndexOf } from './word-index-of.ts'

import type { SearchIndexOfParams, StandardSearchIndex } from './standard-search.types.ts'

/**
 * Builds the search structures of one standard from its indexed files: the word index (stemmed words
 * and the lines holding them), the units find scores, and the tag links of the vocabulary.
 */
export function searchIndexOf(params: SearchIndexOfParams): StandardSearchIndex {
	const { files, vocabulary } = params
	const { units, lineUnits } = unitsOf({ files })
	return {
		files,
		vocabulary,
		words: wordIndexOf({ files }),
		units,
		lineUnits,
		tagLinks: tagLinksOf({ files, units, lineUnits, vocabulary }),
	}
}
