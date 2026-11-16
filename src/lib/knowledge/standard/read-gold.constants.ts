import type { GoldKind } from './standard-search.types.ts'

/** The kinds of a gold item, in the order the refusal lists them (D45). */
export const GOLD_KINDS = [
	'fact',
	'polarity',
	'exception',
	'not-in-text',
] as const satisfies readonly GoldKind[]

/** The separator of the kinds in a refusal. */
export const GOLD_KIND_SEPARATOR = ', '

/** The refusals of a gold file; `{...}` are filled in. */
export const GOLD_MESSAGES = {
	unreadable: 'cannot read the gold file {path}',
	malformed: '{path} line {line}: {reason}',
	notJson: 'not a JSON object',
	shape: 'expected { question, about?, kind?, answer?, status?, expected: [{ file, quote }] }',
	unknownKind: 'kind {kind} is not one of {kinds}',
} as const
