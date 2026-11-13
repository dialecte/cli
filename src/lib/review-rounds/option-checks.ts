/**
 * The checks of the free-text options of the review rounds' verbs (`lot snapshot --by --reason`, `lot verify --by
 * --note`): one non-empty line, and no word of the machine's forbidden list (33L1 D3). Shared by both commands.
 */
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { findReferences } from '../rules/committed-text.ts'
import { forbiddenWordPatterns, readForbiddenWords } from '../rules/forbidden-words.ts'
import { FORBIDDEN_WORD_REFUSAL, LINE_BREAK_PATTERN } from './review-rounds.constants.ts'

import type { ForbiddenWordOption } from './review-rounds.types.ts'

/** Whether the value is given, holds a non-blank character and no line break. */
export function isOneLine(value: string | undefined): value is string {
	return value !== undefined && value.trim() !== '' && !LINE_BREAK_PATTERN.test(value)
}

/**
 * The refusal of a review rounds' verb whose option holds a word of the machine's forbidden list (33L1 D3): the first
 * such option of `options`, named without its word; undefined when none holds one.
 */
export function forbiddenWordRefusal(params: {
	root: string
	verb: string
	options: readonly ForbiddenWordOption[]
}): string | undefined {
	const patterns = forbiddenWordPatterns(readForbiddenWords({ root: params.root }))
	const holding = params.options.find(
		(candidate) => findReferences({ text: candidate.text, patterns }).length > 0,
	)
	if (!holding) return undefined
	return fillMessage({
		template: FORBIDDEN_WORD_REFUSAL,
		values: { verb: params.verb, option: holding.option },
	})
}
