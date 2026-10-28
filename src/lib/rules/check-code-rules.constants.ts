/** The code rules `dialecte rules` checks, in the order they are reported for one position. */
import type { FileKind } from './check-code-rules.types.ts'

/** The kinds of file whose code is walked for the function, parameter, name and await rules. */
export const CODE_VISITED_KINDS: readonly FileKind[] = [
	'implementation',
	'types',
	'constants',
	'config',
	'test',
]

export const RULE_NAMES = [
	'type-outside-types-file',
	'constant-outside-constants-file',
	'function-as-const',
	'await-in-argument',
	'positional-parameters',
	'abbreviation',
	'committed-text-reference',
] as const

/** A module constant by its name: `MAX_DEPTH`, `ROOTS`. */
export const CONSTANT_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

/**
 * Leading parameters that may stay positional before the params object: the query or transaction a
 * domain function reads and writes through.
 */
export const LEADING_POSITIONAL_PARAMETERS: readonly string[] = ['query', 'tx', 'transaction']

/** Abbreviations a reviewer asks to spell out, compared with each camelCase word of a declared name. */
export const ABBREVIATIONS: Readonly<Record<string, string>> = {
	attr: 'attribute',
	attrs: 'attributes',
	el: 'element',
	els: 'elements',
	elem: 'element',
	idx: 'index',
}

/** Text files `rules` checks for references when it picks the changed files itself. */
export const TEXT_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|mjs|cjs|md|json|ya?ml)$/
