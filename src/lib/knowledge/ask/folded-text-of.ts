import { matchableTextOf } from '../standard/matchable-text-of.ts'
import {
	LOWER_CASE_START_PATTERN,
	SPLIT_WORD_END_PATTERN,
} from '../standard/standard-index.constants.ts'
import { IN_WORD_HYPHEN_PATTERN, WORD_SEPARATOR } from './ask.constants.ts'

import type { FoldedTextOfParams } from './ask.types.ts'

/**
 * A text as quotes and ranges are compared: markup stripped, normalised and lower-cased as the gold matcher does,
 * then every hyphen between two letters removed, with or without the space after it (`non-empty`, `non- empty` and
 * a compound split across lines all give `nonempty`, D27). The same on both sides.
 */
export function foldedTextOf(params: FoldedTextOfParams): string {
	const words = matchableTextOf(params.text)
		.replace(IN_WORD_HYPHEN_PATTERN, '')
		.split(WORD_SEPARATOR)
		.filter((word) => word !== '')
	const folded: string[] = []
	for (const word of words) {
		const previous = folded[folded.length - 1]
		if (
			previous !== undefined &&
			SPLIT_WORD_END_PATTERN.test(previous) &&
			LOWER_CASE_START_PATTERN.test(word)
		)
			folded[folded.length - 1] = `${previous.slice(0, -1)}${word}`
		else folded.push(word)
	}
	return folded.join(WORD_SEPARATOR)
}
