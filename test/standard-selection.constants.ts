/** Constants of the standard selection, the loader and the re-ask tests: a synthetic public name and its folders. */
import type { AskStandard } from '../src/lib/knowledge/ask/ask.types.ts'

/** The standard name a dialecte declares in these tests (synthetic), its key and the folder id of that key. */
export const DECLARED_NAME = 'Example 0000'
export const DECLARED_KEY = 'example0000'
export const DECLARED_FOLDER = 'example-0000'

/** A folder whose id gives the same key as the declared name's. */
export const SAME_KEY_FOLDER = 'example.0000'

/** Two unrelated folders sharing one key (not the declared one's). */
export const UNRELATED_SAME_KEY_FOLDERS = ['alpha-1', 'alpha.1'] as const

/** A folder id no root of these tests holds. */
export const UNKNOWN_FOLDER = 'missing-9'

/** A file at the top of a root: what damages it. */
export const STRAY_FILE = 'stray.md'

/** Two folders of other standards. */
export const OTHER_FOLDERS = ['alpha-1', 'beta-2'] as const

/** What an ask without documents of the declared standard holds. */
export const OUTSIDE_STANDARD: AskStandard = {
	kind: 'none',
	name: DECLARED_NAME,
	key: DECLARED_KEY,
}

/** A name with a full-width letter and digits, which NFKC folds to `Example 0000`. */
export const FULL_WIDTH_NAME = 'Ｅxample ００００'

/** The word the synthetic folders hold. */
export const FOLDER_WORD = 'zorbit'

/** The questions of the unchecked facts of the re-ask tests. */
export const REASK_QUESTIONS = {
	first: 'May the first example element be left out?',
	second: 'Does the second example element need a name?',
	elsewhere: 'Does the third example element repeat?',
	reasked: 'Is the fourth example element ordered?',
	otherReason: 'May the sixth example element repeat?',
	noReason: 'Is the seventh example element optional?',
	superseded: 'Does the eighth example element hold a value?',
} as const

/** The packages of the re-ask tests: the one whose standard now has documents, and another. */
export const REASK_PACKAGE = '@acme/widget'
export const OTHER_PACKAGE = '@acme/gadget'

/** The ask ids the re-ask tests' claim hands out, in order. */
export const CLAIMED_ASKS = ['A-0101', 'A-0102', 'A-0103', 'A-0104'] as const
