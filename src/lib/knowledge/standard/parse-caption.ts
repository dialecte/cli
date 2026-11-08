import { CAPTION_PATTERN, CAPTION_WORDS } from './standard-index.constants.ts'

import type { StandardCaption } from './standard-index.types.ts'

/**
 * Reads a caption line: the table or figure word, a number (`<n>` or `<Letter>.<n>`), then a
 * separator (hyphen, en dash, em dash, colon, dot) or the end of the line. Null for any other line.
 */
export function parseCaption(content: string): StandardCaption | null {
	const match = CAPTION_PATTERN.exec(content)
	if (!match) return null
	return { word: match[1] === CAPTION_WORDS.table ? 'table' : 'figure', number: match[2] }
}
