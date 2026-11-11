import type { BoundaryCase } from './forbidden-words-boundaries.types.ts'

/** Invented words that start or end with a non-ASCII letter or a non-word character; never a real name. */
export const LETTER_FIRST_WORD = 'Ézorbla'
export const LETTER_LAST_WORD = 'zorblaé'
export const SIGN_FIRST_WORD = '@zorblat'
export const SIGN_LAST_WORD = 'zorb!'

/** Whole words are found, a word inside a longer one never is. */
export const BOUNDARY_CASES: readonly BoundaryCase[] = [
	{
		title: 'a word starting with a non-ASCII letter, alone in the text',
		word: LETTER_FIRST_WORD,
		text: `${LETTER_FIRST_WORD} wrote this`,
		found: true,
	},
	{
		title: 'a word starting with a non-ASCII letter, inside a longer word',
		word: LETTER_FIRST_WORD,
		text: `x${LETTER_FIRST_WORD} wrote this, ${LETTER_FIRST_WORD}s too`,
		found: false,
	},
	{
		title: 'a word ending with a non-ASCII letter, alone in the text',
		word: LETTER_LAST_WORD,
		text: `made by ${LETTER_LAST_WORD}`,
		found: true,
	},
	{
		title: 'a word ending with a non-ASCII letter, inside a longer word',
		word: LETTER_LAST_WORD,
		text: `made by ${LETTER_LAST_WORD}x and x${LETTER_LAST_WORD}`,
		found: false,
	},
	{
		title: 'a word starting with a non-word character, alone in the text',
		word: SIGN_FIRST_WORD,
		text: `ping ${SIGN_FIRST_WORD} now`,
		found: true,
	},
	{
		title: 'a word starting with a non-word character, inside a longer word',
		word: SIGN_FIRST_WORD,
		text: `ping x${SIGN_FIRST_WORD} and ${SIGN_FIRST_WORD}y`,
		found: false,
	},
	{
		title: 'a word ending with a non-word character, alone in the text',
		word: SIGN_LAST_WORD,
		text: `say ${SIGN_LAST_WORD} now`,
		found: true,
	},
	{
		title: 'a word ending with a non-word character, inside a longer word',
		word: SIGN_LAST_WORD,
		text: `say ${SIGN_LAST_WORD}x and y${SIGN_LAST_WORD}`,
		found: false,
	},
]
