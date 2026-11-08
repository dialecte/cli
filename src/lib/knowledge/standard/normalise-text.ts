import {
	DASH_PATTERN,
	DOUBLE_QUOTE_PATTERN,
	SINGLE_QUOTE_PATTERN,
	SOFT_HYPHEN_PATTERN,
	WHITESPACE_RUN_PATTERN,
} from './standard-index.constants.ts'

/**
 * Folds text the way a quote is compared: compatibility forms (ligatures, Unicode spaces) to their
 * plain letters, soft hyphens removed, dashes and the minus sign to a hyphen, curly quotes to straight
 * ones, whitespace runs to one space, trimmed.
 */
export function normaliseText(text: string): string {
	return text
		.normalize('NFKC')
		.replace(SOFT_HYPHEN_PATTERN, '')
		.replace(DASH_PATTERN, '-')
		.replace(SINGLE_QUOTE_PATTERN, "'")
		.replace(DOUBLE_QUOTE_PATTERN, '"')
		.replace(WHITESPACE_RUN_PATTERN, ' ')
		.trim()
}
