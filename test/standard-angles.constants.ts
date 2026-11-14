/** Constants of `standard eval --angles` cases that compare it with plain `standard eval` (D27). */
import { SAMPLE_WORD } from './standard-workspace.constants.ts'
import { sampleValueSentence } from './standard-workspace.ts'
import { buildSyntheticStandard } from './synthetic-standard.ts'

/** The files that all hold the sample word: find lists them one slice each, in file order. */
export const CROWDED_FILES = ['one.md', 'two.md', 'three.md', 'four.md', 'five.md'] as const

/** A file that names the parents, children and attributes of `AA_1` and none of the question's words: only an angle finds it. */
export const FAMILY_FILE_TEXT = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Family' },
		{ kind: 'raw', lines: ['The A element holds D and DD_1 with the attributes a, b and c.'] },
	],
})

/** The file whose slice find lists fifth, and the one quote of the item: found at rank 5 by `find` alone. */
export const FIFTH_FILE = 'alpha/three'

/** A question naming the sample word and a tag of the test dialecte: the angles add slices of the tag file. */
export const CROWDED_QUESTION = `${SAMPLE_WORD} AA_1`

/** The gold item whose quote find alone holds at its fifth slice. */
export const CROWDED_ITEM = {
	question: CROWDED_QUESTION,
	expected: [{ file: FIFTH_FILE, quote: sampleValueSentence(SAMPLE_WORD).toLowerCase() }],
}
