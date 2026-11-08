import { SYNTHETIC_ATTRIBUTES, SYNTHETIC_TAGS } from './synthetic-standard.constants.ts'

import type { StandardVocabulary } from '../src/lib/knowledge/standard/standard-search.types.ts'
import type { SyntheticFile } from './search-synthetic-standard.types.ts'
import type { SyntheticBlock } from './synthetic-standard.types.ts'

/** No dialecte installed: no name to link. */
export const EMPTY_VOCABULARY: StandardVocabulary = { tags: [], attributes: [], values: [] }

/** The vocabulary of core's test dialecte: the tags and attributes the synthetic text names. */
export const SYNTHETIC_VOCABULARY: StandardVocabulary = {
	tags: [...SYNTHETIC_TAGS],
	attributes: [...SYNTHETIC_ATTRIBUTES],
	values: [],
}

/** The vocabulary of core's test dialecte with its enumeration values, an invented capitalised one besides. */
export const VALUES_VOCABULARY: StandardVocabulary = {
	tags: [...SYNTHETIC_TAGS],
	attributes: [...SYNTHETIC_ATTRIBUTES],
	values: ['x', 'y', 'z', 'Gammas'],
}

/** Names that are ordinary words once lowercased: a lowercase attribute, a capitalised tag, an underscored attribute. */
export const WORDLIKE_VOCABULARY: StandardVocabulary = {
	tags: ['Zorbex'],
	attributes: ['quill', 'quill_2'],
	values: [],
}

/** The logical lines of the padding file: enough that a word held by a few lines stays under 5 %. */
export const PADDING_LINES = 200

/** A file of unrelated, separate logical lines under one heading. */
export const PADDING_FILE: SyntheticFile = {
	fileId: 'synthetic/pad-9000-0',
	blocks: [
		{ kind: 'heading', number: '1', title: 'Padding' },
		...Array.from({ length: PADDING_LINES }, (): SyntheticBlock[] => [
			{ kind: 'raw', lines: ['Filler passage.'] },
			{ kind: 'blank' },
		]).flat(),
	],
}
