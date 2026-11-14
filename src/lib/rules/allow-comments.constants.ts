import type { RuleName } from './check-code-rules.types.ts'

/** The keyword an opt-out starts with: a text without it holds no opt-out. */
export const ALLOW_KEYWORD = 'dialecte-allow'

/** A `dialecte-allow` opt-out, at the start of a comment's text: its rule list, then its reason, are what follows the keyword. */
export const ALLOW_COMMENT_PATTERN = new RegExp(`^${ALLOW_KEYWORD}\\b(?<rest>.*)$`)

/** A reason shorter than this many characters is no reason. */
export const ALLOW_REASON_MIN_LENGTH = 15

/** The form an opt-out takes, given in every `invalid-allow` message. */
export const ALLOW_GRAMMAR = 'dialecte-allow <rule>[, <rule>]: <reason>'

/**
 * The rules judged on a whole function: an opt-out in the comments right before the function (above or inside its
 * doc comment) covers their findings too.
 */
export const FUNCTION_WIDE_RULES: readonly RuleName[] = ['argument-mutation', 'long-function']

/** What is wrong with an opt-out: `{names}` the rules it names that no opt-out may silence. */
export const ALLOW_PROBLEMS = {
	noColon: 'malformed: no `:` before the reason',
	noRule: 'malformed: no rule named',
	notAllowable: 'not an allowable rule: {names}',
	shortReason: `reason under ${ALLOW_REASON_MIN_LENGTH} characters`,
} as const

/** An `invalid-allow` message: `{problem}` what is wrong. */
export const INVALID_ALLOW_MESSAGE = `opt-out {problem}: write \`${ALLOW_GRAMMAR}\` with a quality rule and a reason of at least ${ALLOW_REASON_MIN_LENGTH} characters`

/** An `unused-allow` message: `{names}` the rules of the opt-out that cover no finding, `{where}` where it looked. */
export const UNUSED_ALLOW_MESSAGE =
	'opt-out of {names} covers no finding {where}: remove it, or move it over the finding'

/** Where an opt-out covers: a function-wide rule also before the function. */
export const UNUSED_ALLOW_WHERE = {
	line: 'on its line or the next',
	function: 'on its line or the next, or before the function',
} as const
