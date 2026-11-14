/**
 * The synthetic standard the index families of the angles read: two defined terms (one names `AA_1`), a clause
 * headed by `AA_1` that cites the third clause, that third clause, and a table whose caption names `AA_1`.
 */
import { SYNTHETIC_VOCABULARY } from './search-synthetic-standard.constants.ts'
import { searchSynthetic } from './search-synthetic-standard.ts'
import { citationOf } from './synthetic-standard.ts'

import type { StandardSearchIndex } from '../src/lib/knowledge/standard/standard-search.types.ts'
import type { SyntheticBlock } from './synthetic-standard.types.ts'

/** The blocks of that standard. */
export function indexFamiliesBlocks(): SyntheticBlock[] {
	return [
		{ kind: 'heading', number: '1', title: 'Terms and definitions' },
		{ kind: 'definition', number: '1.1', term: 'AA_1 node', layout: 'inline' },
		{ kind: 'raw', lines: ['Describes a node of the document.'] },
		{ kind: 'blank' },
		{ kind: 'definition', number: '1.2', term: 'beta thing', layout: 'inline' },
		{ kind: 'raw', lines: ['Describes a thing.'] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'AA_1 structure' },
		{ kind: 'blank' },
		{ kind: 'raw', lines: [`See ${citationOf({ word: 'clause', number: '3' })}.`] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '3', title: 'Ordering rules' },
		{ kind: 'blank' },
		{ kind: 'raw', lines: ['Unrelated text.'] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '4', title: 'Values' },
		{ kind: 'blank' },
		{ kind: 'caption', word: 'table', number: '1', title: 'AA_1 values' },
		{ kind: 'table', columns: ['a', 'b'], rows: [['x', 'y']] },
	]
}

/** The search index of that standard, linked with the synthetic vocabulary. */
export function indexFamiliesIndex(): StandardSearchIndex {
	return searchSynthetic({
		files: [{ blocks: indexFamiliesBlocks() }],
		vocabulary: SYNTHETIC_VOCABULARY,
	})
}
