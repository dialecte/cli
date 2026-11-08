import { normaliseText } from './normalise-text.ts'
import {
	ANNEX_HEADING_PATTERN,
	ANNEX_SUB_HEADING_PATTERN,
	CAPITAL_START_PATTERN,
	DIGITS_PATTERN,
	LETTER_ORDER_BASE,
	NUMBERED_HEADING_PATTERN,
	QUALIFIER_AFTER_PATTERN,
	QUALIFIER_BEFORE_PATTERN,
	TITLE_LENGTH_LIMIT,
	TOP_LEVEL_NUMBER_LIMIT,
} from './standard-index.constants.ts'

import type { StandardHeadingCandidate } from './standard-index.types.ts'

/**
 * A heading-shaped line read as a candidate: a number, the annex word and a letter, or an annex
 * sub-number, then a title starting with a capital letter under the length limit. A top-level number
 * above the limit is never one. Null when the line is not a candidate.
 */
export function parseHeadingCandidate(params: {
	content: string
	line: number
}): StandardHeadingCandidate | null {
	const { content, line } = params
	const annex = ANNEX_HEADING_PATTERN.exec(content)
	if (annex) {
		const title = annex[2]
			.replace(QUALIFIER_BEFORE_PATTERN, '')
			.replace(QUALIFIER_AFTER_PATTERN, '')
		return candidateOf({ line, number: annex[1], title })
	}
	const numbered = NUMBERED_HEADING_PATTERN.exec(content) ?? ANNEX_SUB_HEADING_PATTERN.exec(content)
	if (!numbered) return null
	return candidateOf({ line, number: numbered[1], title: numbered[2] })
}

function candidateOf(params: {
	line: number
	number: string
	title: string
}): StandardHeadingCandidate | null {
	const { line, number } = params
	const title = params.title.trim()
	if (title.length === 0 || title.length >= TITLE_LENGTH_LIMIT) return null
	if (!CAPITAL_START_PATTERN.test(title)) return null
	const parts = number.split('.')
	const top = DIGITS_PATTERN.test(parts[0]) ? Number(parts[0]) : null
	if (top !== null && top > TOP_LEVEL_NUMBER_LIMIT) return null
	return {
		line,
		number,
		title: normaliseText(title),
		depth: parts.length,
		order: parts.map(orderOfPart),
		top,
	}
}

/** A number part sorts by its value; a letter part sorts after every number, letters alphabetically. */
function orderOfPart(part: string): number {
	return DIGITS_PATTERN.test(part) ? Number(part) : LETTER_ORDER_BASE + part.charCodeAt(0)
}
