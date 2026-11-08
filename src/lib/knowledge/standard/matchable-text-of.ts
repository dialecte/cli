import { normaliseText } from './normalise-text.ts'
import {
	MATCH_BREAK_TAG_PATTERN,
	MATCH_EMPHASIS_PATTERN,
	MATCH_HEADING_MARKER_PATTERN,
	MATCH_TABLE_PIPE_PATTERN,
} from './standard-search.constants.ts'

/**
 * A text as a quote is compared with it, the same on both sides: the markdown markup stripped (table pipes
 * and `<br>` tags to a space, `**` and `__` removed, a leading `#` run removed), then normalised and
 * case-folded.
 */
export function matchableTextOf(text: string): string {
	const stripped = text
		.replace(MATCH_BREAK_TAG_PATTERN, ' ')
		.replace(MATCH_TABLE_PIPE_PATTERN, ' ')
		.replace(MATCH_EMPHASIS_PATTERN, '')
		.replace(MATCH_HEADING_MARKER_PATTERN, '')
	return normaliseText(stripped).toLowerCase()
}
